"use client";

import { useState, useTransition } from "react";
import type { ComputeResult } from "@/lib/inflation/engine";
import type { UserCategoryKey } from "@/lib/cpi/categories";
import Results from "./Results";

interface CategoryDescriptor {
  key: UserCategoryKey;
  label: string;
  description: string;
}

const PRESETS: Record<string, Partial<Record<UserCategoryKey, number>>> = {
  "Urban renter": {
    food: 15000,
    housing: 25000,
    fuel_utilities: 2500,
    transport: 6000,
    healthcare: 2000,
    education: 3000,
    clothing: 2000,
    household_personal: 3000,
    miscellaneous: 2500,
  },
  "Family with kids": {
    food: 22000,
    housing: 18000,
    fuel_utilities: 3500,
    transport: 8000,
    healthcare: 4000,
    education: 12000,
    clothing: 3000,
    household_personal: 4000,
    miscellaneous: 3000,
  },
  "Retired household": {
    food: 12000,
    housing: 8000,
    fuel_utilities: 2500,
    transport: 2500,
    healthcare: 10000,
    education: 0,
    clothing: 1500,
    household_personal: 2500,
    miscellaneous: 2000,
  },
};

export default function Calculator({ categories }: { categories: CategoryDescriptor[] }) {
  const [spending, setSpending] = useState<Partial<Record<UserCategoryKey, number>>>({});
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function setField(key: UserCategoryKey, value: string) {
    const n = value === "" ? undefined : Number(value);
    setSpending((s) => ({ ...s, [key]: Number.isFinite(n as number) ? (n as number) : undefined }));
  }

  function applyPreset(name: string) {
    const p = PRESETS[name];
    if (!p) return;
    setSpending(p);
    setResult(null);
    setExplanation(null);
  }

  function reset() {
    setSpending({});
    setResult(null);
    setExplanation(null);
  }

  async function calculate() {
    setExplanation(null);
    startTransition(async () => {
      const res = await fetch("/api/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spending }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as ComputeResult;
      setResult(data);
    });
  }

  async function explain() {
    if (!result) return;
    setExplainLoading(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spending }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { text: string; source: string };
      setExplanation(data);
    } finally {
      setExplainLoading(false);
    }
  }

  const total = Object.values(spending).reduce<number>(
    (s, v) => s + (typeof v === "number" && v > 0 ? v : 0),
    0,
  );

  return (
    <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
      <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Your monthly spending (₹)</h2>
          <div className="text-sm text-ink-500">
            Total: <span className="font-semibold text-ink-800">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => applyPreset(name)}
              className="rounded-full border border-ink-200 bg-ink-50 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100"
            >
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {categories.map((c) => (
            <label key={c.key} className="flex flex-col">
              <span className="text-sm font-medium text-ink-800">{c.label}</span>
              <span className="mb-1 text-xs text-ink-500">{c.description}</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
                  ₹
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  value={spending[c.key] ?? ""}
                  onChange={(e) => setField(c.key, e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-7 pr-3 text-sm text-ink-900 outline-none ring-0 focus:border-ink-500"
                />
              </div>
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={calculate}
            disabled={isPending || total === 0}
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Calculating…" : "Calculate my inflation"}
          </button>
          {total === 0 && (
            <span className="text-xs text-ink-500">Enter at least one category to calculate.</span>
          )}
        </div>
      </section>

      <section>
        {result ? (
          <Results
            result={result}
            explanation={explanation}
            explainLoading={explainLoading}
            onExplain={explain}
          />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-500">
            <p className="mb-1 font-medium text-ink-700">Results will appear here</p>
            <p>
              Try a preset or enter your own spending, then hit{" "}
              <span className="font-medium">Calculate my inflation</span>.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
