"use client";

import { useState, useRef } from "react";
import { toPng } from "html-to-image";
import { Download, Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { ComputeResult } from "@/lib/inflation/engine";
import GapDecomposition from "./GapDecomposition";
import TrendChart from "./TrendChart";
import BasketComparison from "./BasketComparison";

interface MonthlyPoint { month: string; personal: number | null; official: number }
type Compute = ComputeResult & { monthly_series?: MonthlyPoint[]; state?: string; state_code?: number; spending_raw?: any };

function pct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function pp(n: number, digits = 2): string {
  const v = n * 100;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)} pp`;
}

export default function Results({ result }: { result: Compute }) {
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const officialDisplay = result.official_headline ?? result.official_inflation;
  const displayGap = result.personal_inflation - officialDisplay;
  const gapColor =
    displayGap > 0.0005
      ? "text-rose-400"
      : displayGap < -0.0005
        ? "text-emerald-400"
        : "text-zinc-500";

  const isDeflation = result.personal_inflation < -0.001;
  const active = result.categories.filter((c) => c.weight > 0);
  const maxAbsContribution = Math.max(
    ...active.map((c) => Math.abs(c.contribution)),
    0.0001,
  );

  async function explain() {
    setExplainLoading(true);
    setExplanation(null);
    setExplainError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spending: result.spending_raw || {},
          sector: result.sector,
          state_code: result.state_code,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data && typeof data.text === "string") {
        setExplanation({ text: data.text, source: data.source ?? "fallback" });
      } else {
        setExplainError(
          (data && (data.detail || data.error)) || `Could not generate insight (status ${res.status}).`,
        );
      }
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Network error");
    } finally {
      setExplainLoading(false);
    }
  }

  async function downloadReceipt() {
    if (!receiptRef.current) return;
    try {
      const dataUrl = await toPng(receiptRef.current, { cacheBust: true, backgroundColor: "#09090b" });
      const link = document.createElement("a");
      link.download = `my-inflation-${result.as_of_month}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      
      {/* Receipt Card */}
      <motion.div
        key={result.total_spend}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div ref={receiptRef} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r opacity-50 ${isDeflation ? "from-blue-500 to-cyan-300" : "from-emerald-500 to-emerald-300"}`} />
          <div className="flex items-start justify-between">
            <div className="grid grid-cols-3 gap-6 w-full">
              <Stat label="Your inflation" value={pct(result.personal_inflation)} emphasis valueClassName={isDeflation ? "text-blue-300" : undefined} />
              <Stat label="Official CPI" value={pct(officialDisplay)} />
              <Stat label="Gap" value={pp(displayGap)} valueClassName={gapColor} />
            </div>
            <button
              onClick={downloadReceipt}
              className="ml-4 flex-shrink-0 rounded-full bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white transition"
              title="Download Receipt"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Based on monthly spending of ₹{result.total_spend.toLocaleString("en-IN")} · as of{" "}
            {formatMonth(result.as_of_month)} · CPI base {result.base_year}=100 · sector{" "}
            <span className="font-medium uppercase text-zinc-400">{result.sector}</span>
            {result.state && result.state !== "All India" && (
              <> · <span className="font-medium text-zinc-400">{result.state}</span></>
            )}
          </p>
        </div>
      </motion.div>

      {/* Purchasing Power Insight */}
      {result.total_spend > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm backdrop-blur-md">
          <h3 className="mb-4 text-sm font-semibold text-zinc-100">What This Means For Your Wallet</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
                {isDeflation ? "Monthly price drop" : "Extra cost per month"}
              </div>
              <div className={`text-2xl font-bold ${isDeflation ? "text-emerald-400" : "text-rose-400"}`}>
                ₹{Math.abs(Math.round(result.total_spend * result.personal_inflation / 12)).toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {isDeflation
                  ? "Your basket costs this much less each month than last year"
                  : "Your basket costs this much more each month than last year"}
              </div>
            </div>
            <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">Your ₹{Math.round(result.total_spend / 1000)}k is now worth</div>
              <div className={`text-2xl font-bold ${isDeflation ? "text-emerald-400" : "text-amber-400"}`}>
                ₹{Math.round(result.total_spend / (1 + result.personal_inflation)).toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {isDeflation
                  ? <>In last year&apos;s rupees — that&apos;s ₹{Math.abs(Math.round(result.total_spend - result.total_spend / (1 + result.personal_inflation))).toLocaleString("en-IN")} of <span className="text-emerald-400">gained</span> purchasing power</>
                  : <>In last year&apos;s rupees — that&apos;s ₹{Math.round(result.total_spend - result.total_spend / (1 + result.personal_inflation)).toLocaleString("en-IN")} of lost purchasing power</>}
              </div>
            </div>
          </div>
          {displayGap > 0.005 && (
            <div className="mt-4 rounded-lg bg-rose-950/30 border border-rose-800/40 px-4 py-3 text-sm text-rose-200">
              <strong>You&apos;re hit harder than average.</strong> You need{" "}
              <span className="font-semibold text-rose-300">
                ₹{Math.round(result.total_spend * displayGap / 12).toLocaleString("en-IN")}/mo more
              </span>{" "}
              than the national average household to cope with the same prices, because your spending is concentrated in higher-inflation categories.
            </div>
          )}
          {displayGap < -0.005 && (
            <div className="mt-4 rounded-lg bg-emerald-950/30 border border-emerald-800/40 px-4 py-3 text-sm text-emerald-200">
              <strong>You&apos;re beating the average.</strong> Your spending mix shields you from{" "}
              <span className="font-semibold text-emerald-300">
                ₹{Math.abs(Math.round(result.total_spend * displayGap / 12)).toLocaleString("en-IN")}/mo
              </span>{" "}
              of inflation impact compared to the national baseline.
            </div>
          )}
        </div>
      )}

      {/* Basket Comparison */}
      <BasketComparison rows={result.gap_decomposition} />

      {/* AI Insights Card */}
      <div className="rounded-2xl border border-emerald-900/30 bg-emerald-950/20 p-6 shadow-xl backdrop-blur-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <Sparkles className="h-4 w-4" /> AI Financial Insight
          </h3>
          {explanation && explanation.source === "gemini" && (
            <span className="rounded-full bg-emerald-900/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
              Gemini AI
            </span>
          )}
        </div>
        
        {explanation ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="text-sm leading-relaxed text-zinc-300">{explanation.text}</p>
            <button
              type="button"
              onClick={explain}
              disabled={explainLoading}
              className="mt-4 text-xs font-medium text-emerald-500 hover:text-emerald-400 disabled:opacity-50"
            >
              {explainLoading ? "Regenerating..." : "Regenerate Insight"}
            </button>
          </motion.div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-zinc-400">
              Get an AI-powered explanation of your personal inflation gap and actionable advice.
            </p>
            <button
              type="button"
              onClick={explain}
              disabled={explainLoading}
              className="flex items-center gap-2 rounded-full bg-emerald-600/20 px-4 py-2 text-sm font-medium text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition disabled:opacity-50"
            >
              {explainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {explainLoading ? "Thinking..." : "Generate Insight"}
            </button>
            {explainError && (
              <p className="text-xs text-rose-400">{explainError}</p>
            )}
          </div>
        )}
      </div>

      {result.monthly_series && result.monthly_series.length > 1 && (
        <TrendChart data={result.monthly_series} />
      )}

      <GapDecomposition rows={result.gap_decomposition} />

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">
          Inflation breakdown by category
        </h3>
        <ul className="space-y-4">
          {active
            .slice()
            .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
            .map((c) => {
              const width = Math.max(4, (Math.abs(c.contribution) / maxAbsContribution) * 100);
              const barColor = c.contribution < 0 ? "bg-blue-500" : "bg-rose-400";
              return (
                <li key={c.key} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between text-zinc-300">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-zinc-500">
                      {pct(c.weight, 0)} of spend · {pct(c.inflation)} YoY ·{" "}
                      <span className={`font-medium ${c.contribution < 0 ? "text-blue-300" : "text-zinc-100"}`}>{pp(c.contribution)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={`h-full rounded-full ${barColor}`}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis,
  valueClassName,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={`mt-1 tabular-nums ${
          emphasis ? "text-3xl font-bold text-white" : "text-xl font-semibold text-zinc-200"
        } ${valueClassName ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatMonth(m: string): string {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" });
}
