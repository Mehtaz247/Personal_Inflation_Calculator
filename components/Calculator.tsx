"use client";

import { useState, useTransition } from "react";
import type { ComputeResult } from "@/lib/inflation/engine";
import type { UserCategoryKey } from "@/lib/cpi/categories";
import type { Sector } from "@/lib/cpi/types";
import Results from "./Results";

interface CategoryDescriptor {
  key: UserCategoryKey;
  label: string;
  description: string;
}

interface MonthlyPoint { month: string; personal: number; official: number }
type Compute = ComputeResult & { monthly_series?: MonthlyPoint[] };

const PRESETS: Record<string, Partial<Record<UserCategoryKey, number>>> = {
  "Urban renter": {
    food: 15000, eating_out: 4000, housing: 27500,
    transport: 6000, communication: 1200,
    healthcare: 2000, education: 3000, clothing: 2000,
    household_personal: 3000, entertainment: 1500, tobacco_alcohol: 0,
  },
  "Family with kids": {
    food: 22000, eating_out: 3000, housing: 21500,
    transport: 8000, communication: 1500,
    healthcare: 4000, education: 12000, clothing: 3000,
    household_personal: 4000, entertainment: 1500, tobacco_alcohol: 0,
  },
  "Retired household": {
    food: 12000, eating_out: 1000, housing: 10500,
    transport: 2500, communication: 800,
    healthcare: 10000, education: 0, clothing: 1500,
    household_personal: 2500, entertainment: 1000, tobacco_alcohol: 0,
  },
};

const STATES = [
  "All India",
  "Andaman And Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
  "Bihar", "Chandigarh", "Chhattisgarh",
  "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh",
  "Jammu And Kashmir", "Jharkhand",
  "Karnataka", "Kerala",
  "Ladakh", "Lakshadweep",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "NCT of Delhi",
  "Odisha",
  "Puducherry", "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu", "Telangana", "The Dadra And Nagar Haveli And Daman And Diu", "Tripura",
  "Uttar Pradesh", "Uttarakhand",
  "West Bengal",
];

export default function Calculator({ categories }: { categories: CategoryDescriptor[] }) {
  const [spending, setSpending] = useState<Partial<Record<UserCategoryKey, number>>>({});
  const [sector, setSector] = useState<Sector>("combined");
  const [state, setState] = useState("All India");
  const [result, setResult] = useState<Compute | null>(null);
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
        body: JSON.stringify({ spending, sector, state }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Compute;
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
        body: JSON.stringify({ spending, sector, state }),
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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink-900">Your monthly spending (₹)</h2>
          <div className="text-sm text-ink-500">
            Total: <span className="font-semibold text-ink-800">₹{total.toLocaleString("en-IN")}</span>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-ink-600">
              State
              <select
                value={state}
                onChange={(e) => { setState(e.target.value); setResult(null); setExplanation(null); }}
                className="rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-800"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600">
              Sector
              <select
                value={sector}
                onChange={(e) => { setSector(e.target.value as Sector); setResult(null); setExplanation(null); }}
                className="rounded border border-ink-200 bg-white px-2 py-1 text-xs text-ink-800"
              >
                <option value="combined">Combined</option>
                <option value="urban">Urban</option>
                <option value="rural">Rural</option>
              </select>
            </label>
          </div>
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
