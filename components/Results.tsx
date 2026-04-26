"use client";

import type { ComputeResult } from "@/lib/inflation/engine";

function pct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function pp(n: number, digits = 2): string {
  const v = n * 100;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)} pp`;
}

export default function Results({
  result,
  explanation,
  explainLoading,
  onExplain,
}: {
  result: ComputeResult;
  explanation: { text: string; source: string } | null;
  explainLoading: boolean;
  onExplain: () => void;
}) {
  const gapColor =
    result.gap > 0.0005
      ? "text-rose-600"
      : result.gap < -0.0005
        ? "text-emerald-600"
        : "text-ink-500";

  const active = result.categories.filter((c) => c.weight > 0);
  const maxAbsContribution = Math.max(
    ...active.map((c) => Math.abs(c.contribution)),
    0.0001,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Your personal inflation" value={pct(result.personal_inflation)} emphasis />
          <Stat label="Official CPI" value={pct(result.official_inflation)} />
          <Stat label="Gap" value={pp(result.gap)} valueClassName={gapColor} />
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Based on monthly spending of ₹{result.total_spend.toLocaleString("en-IN")} · as of{" "}
          {formatMonth(result.as_of_month)} · CPI base {result.base_year}=100
        </p>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-ink-900">
          Where your inflation comes from
        </h3>
        <ul className="space-y-2.5">
          {active
            .slice()
            .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
            .map((c) => {
              const width = Math.max(4, (Math.abs(c.contribution) / maxAbsContribution) * 100);
              return (
                <li key={c.key} className="text-sm">
                  <div className="mb-1 flex items-baseline justify-between text-ink-700">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-ink-500">
                      {pct(c.weight, 0)} of spend · {pct(c.inflation)} YoY ·{" "}
                      <span className="font-medium text-ink-800">{pp(c.contribution)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-ink-700"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">Plain-English summary</h3>
          {explanation && (
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-500">
              {explanation.source === "anthropic" ? "AI-generated" : "Deterministic"}
            </span>
          )}
        </div>
        {explanation ? (
          <p className="text-sm leading-relaxed text-ink-700">{explanation.text}</p>
        ) : (
          <button
            type="button"
            onClick={onExplain}
            disabled={explainLoading}
            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-50"
          >
            {explainLoading ? "Thinking…" : "Explain these numbers"}
          </button>
        )}
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
      <div className="text-xs font-medium uppercase tracking-wider text-ink-500">{label}</div>
      <div
        className={`mt-1 tabular-nums ${
          emphasis ? "text-2xl font-semibold text-ink-900" : "text-xl font-semibold text-ink-800"
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
