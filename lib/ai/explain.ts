import Anthropic from "@anthropic-ai/sdk";
import type { ComputeResult } from "@/lib/inflation/engine";

const MODEL = "claude-haiku-4-5";

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function pp(n: number): string {
  const v = n * 100;
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(2)} pp`;
}

/** Deterministic fallback — used when no ANTHROPIC_API_KEY is configured. */
export function deterministicExplanation(result: ComputeResult): string {
  if (result.total_spend === 0) {
    return "Enter your monthly spending to see how your personal inflation compares to the official CPI.";
  }
  const direction =
    result.gap > 0.0005
      ? "higher than"
      : result.gap < -0.0005
        ? "lower than"
        : "in line with";
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
  source: "anthropic" | "fallback";
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || result.total_spend === 0) {
    return { text: deterministicExplanation(result), source: "fallback" };
  }

  const client = new Anthropic({ apiKey });
  const drivers = result.top_drivers
    .filter((d) => d.weight > 0)
    .map((d) => ({
      category: d.label,
      share_of_spend_pct: +(d.weight * 100).toFixed(2),
      category_inflation_pct: +(d.inflation * 100).toFixed(2),
      contribution_pp: +(d.contribution * 100).toFixed(2),
    }));

  const facts = {
    as_of_month: result.as_of_month,
    personal_inflation_pct: +(result.personal_inflation * 100).toFixed(2),
    official_inflation_pct: +(result.official_inflation * 100).toFixed(2),
    gap_pp: +(result.gap * 100).toFixed(2),
    top_drivers: drivers,
  };

  const systemPrompt =
    "You explain a household's personal inflation result in 2–3 sentences of plain English. " +
    "Rules: use only the numbers in the JSON facts (do not invent any), do not give financial advice, " +
    "do not hedge excessively, do not use emojis, do not use markdown. " +
    "Tone: concise, neutral, credible. Compare personal inflation to official CPI, mention the gap, " +
    "and name the top 1–3 drivers. Refer to the as-of month naturally (e.g. 'March 2026').";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Facts:\n${JSON.stringify(facts, null, 2)}`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) return { text: deterministicExplanation(result), source: "fallback" };
  return { text, source: "anthropic" };
}
