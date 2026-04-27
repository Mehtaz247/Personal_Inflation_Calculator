import { GoogleGenAI } from "@google/genai";
import type { ComputeResult } from "@/lib/inflation/engine";
import { geminiApiKeys, withKeyFailover } from "./gemini-keys";

const MODEL = "gemini-2.5-flash";

function isUnavailable(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "");
  return (err as any)?.status === "UNAVAILABLE" || msg.includes("503") || msg.includes("high demand");
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (!isUnavailable(err) || i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function pp(n: number): string {
  const v = n * 100;
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(2)} pp`;
}

export function deterministicExplanation(result: ComputeResult): string {
  if (result.total_spend === 0) {
    return "Enter your monthly spending to see how your personal inflation compares to the official CPI.";
  }
  const direction =
    result.gap > 0.0005 ? "higher than" : result.gap < -0.0005 ? "lower than" : "in line with";
  const driverNames = result.top_drivers
    .filter((d) => d.weight > 0)
    .map((d) => d.label)
    .slice(0, 3);
  const driverText = driverNames.length
    ? ` The biggest contributors in your basket were ${driverNames.join(", ")}.`
    : "";
  return (
    `Your personal inflation works out to ${pct(result.personal_inflation)}, which is ` +
    `${direction} the official CPI print of ${pct(result.official_inflation)} ` +
    `(gap: ${pp(result.gap)}).${driverText}`
  );
}

export async function generateExplanation(result: ComputeResult): Promise<{
  text: string;
  source: "gemini" | "fallback";
}> {
  if (geminiApiKeys().length === 0 || result.total_spend === 0) {
    return { text: deterministicExplanation(result), source: "fallback" };
  }

  const drivers = result.top_drivers
    .filter((d) => d.weight > 0)
    .map((d) => ({
      category: d.label,
      share_of_spend_pct: +(d.weight * 100).toFixed(2),
      category_inflation_pct: +(d.inflation * 100).toFixed(2),
      contribution_pp: +(d.contribution * 100).toFixed(2),
    }));

  const decomp = result.gap_decomposition.filter((g) => Math.abs(g.gap_contribution) > 1e-7);
  const positives = decomp
    .filter((g) => g.gap_contribution > 0)
    .sort((a, b) => b.gap_contribution - a.gap_contribution)
    .slice(0, 3)
    .map((g) => ({
      category: g.label,
      your_weight_pct: +(g.your_weight * 100).toFixed(1),
      national_weight_pct: +(g.national_weight * 100).toFixed(1),
      gap_contribution_pp: +(g.gap_contribution * 100).toFixed(2),
    }));
  const negatives = decomp
    .filter((g) => g.gap_contribution < 0)
    .sort((a, b) => a.gap_contribution - b.gap_contribution)
    .slice(0, 2)
    .map((g) => ({
      category: g.label,
      your_weight_pct: +(g.your_weight * 100).toFixed(1),
      national_weight_pct: +(g.national_weight * 100).toFixed(1),
      gap_contribution_pp: +(g.gap_contribution * 100).toFixed(2),
    }));

  const mostDivergent = decomp
    .slice()
    .sort((a, b) => Math.abs(b.weight_diff) - Math.abs(a.weight_diff))[0];

  const facts = {
    as_of_month: result.as_of_month,
    sector: result.sector,
    personal_inflation_pct: +(result.personal_inflation * 100).toFixed(2),
    official_inflation_pct: +(result.official_inflation * 100).toFixed(2),
    gap_pp: +(result.gap * 100).toFixed(2),
    top_drivers: drivers,
    top_positive_gap_contributors: positives,
    top_negative_gap_contributors: negatives,
    most_divergent_weight: mostDivergent
      ? {
          category: mostDivergent.label,
          your_weight_pct: +(mostDivergent.your_weight * 100).toFixed(1),
          national_weight_pct: +(mostDivergent.national_weight * 100).toFixed(1),
        }
      : null,
  };

  const systemPrompt =
    "You write a 3-4 sentence explanation of an Indian household's personal inflation result. " +
    "Strict rules: use only the numbers in the JSON facts; do not invent figures or distort the gap sign; " +
    "no emojis; no markdown. Mention at least one specific COICOP division name " +
    "and a specific weight comparison (e.g. 'you spend 25% on Food vs the national 40%'). Refer to the as-of " +
    "month in plain English (e.g. 'March 2026'). IMPORTANT: Conclude with ONE actionable, insightful " +
    "piece of financial advice based on their highest positive gap contributor to help them reduce their personal inflation.";

  const response = await withKeyFailover((apiKey) => {
    const client = new GoogleGenAI({ apiKey });
    return withRetry(() => client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nFacts:\n${JSON.stringify(facts, null, 2)}` }],
        },
      ],
      config: { maxOutputTokens: 400, temperature: 0.9 },
    }));
  });

  const text = (response.text ?? "").trim();
  if (!text) return { text: deterministicExplanation(result), source: "fallback" };
  return { text, source: "gemini" };
}
