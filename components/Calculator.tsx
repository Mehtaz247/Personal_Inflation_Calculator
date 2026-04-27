"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import { Sparkles, Loader2, ArrowRight, AlertTriangle, User, Briefcase, GraduationCap, Heart, Info, Leaf, Drumstick } from "lucide-react";
import { compute, computeMonthlySeries } from "@/lib/inflation/engine";
import type { UserCategoryKey } from "@/lib/cpi/categories";
import type { Sector } from "@/lib/cpi/types";
import Results from "./Results";

interface CategoryDescriptor {
  key: UserCategoryKey;
  label: string;
  description: string;
}

/* ── State name → MoSPI API state_code (alphabetical, verified against api.mospi.gov.in) ── */
const STATE_MAP: Record<string, number> = {
  "All India": 0,
  "Andaman And Nicobar Islands": 2,
  "Andhra Pradesh": 3,
  "Arunachal Pradesh": 4,
  "Assam": 5,
  "Bihar": 6,
  "Chandigarh": 7,
  "Chhattisgarh": 8,
  "Goa": 9,
  "Gujarat": 10,
  "Haryana": 11,
  "Himachal Pradesh": 12,
  "Jammu And Kashmir": 13,
  "Jharkhand": 14,
  "Karnataka": 15,
  "Kerala": 16,
  "Ladakh": 17,
  "Lakshadweep": 18,
  "Madhya Pradesh": 19,
  "Maharashtra": 20,
  "Manipur": 21,
  "Meghalaya": 22,
  "Mizoram": 23,
  "Nagaland": 24,
  "NCT of Delhi": 25,
  "Odisha": 26,
  "Puducherry": 27,
  "Punjab": 28,
  "Rajasthan": 29,
  "Sikkim": 30,
  "Tamil Nadu": 31,
  "Telangana": 32,
  "The Dadra And Nagar Haveli And Daman And Diu": 33,
  "Tripura": 34,
  "Uttar Pradesh": 35,
  "Uttarakhand": 36,
  "West Bengal": 37,
};

const STATES = Object.keys(STATE_MAP);

/* ── Preset spending profiles ── */
interface Preset {
  label: string;
  icon: React.ReactNode;
  description: string;
  spending: Partial<Record<UserCategoryKey, number>>;
}

const PRESETS: Preset[] = [
  {
    label: "Urban Professional",
    icon: <Briefcase className="h-4 w-4" />,
    description: "₹65k/mo · rent-heavy, eats out often",
    spending: { food: 8000, eating_out: 6000, housing: 25000, transport: 5000, communication: 1500, healthcare: 3000, education: 0, clothing: 3000, furnishings: 1500, personal_care: 2500, recreation: 5000, tobacco_alcohol: 0 },
  },
  {
    label: "Middle-Class Family",
    icon: <Heart className="h-4 w-4" />,
    description: "₹45k/mo · kids in school, home-cooking",
    spending: { food: 12000, eating_out: 2000, housing: 10000, transport: 4000, communication: 1000, healthcare: 3000, education: 8000, clothing: 2000, furnishings: 800, personal_care: 1200, recreation: 1000, tobacco_alcohol: 0 },
  },
  {
    label: "Student",
    icon: <GraduationCap className="h-4 w-4" />,
    description: "₹18k/mo · hostel, food, transport",
    spending: { food: 4000, eating_out: 3000, housing: 5000, transport: 2000, communication: 500, healthcare: 500, education: 1500, clothing: 500, furnishings: 200, personal_care: 300, recreation: 500, tobacco_alcohol: 0 },
  },
  {
    label: "Retired Couple",
    icon: <User className="h-4 w-4" />,
    description: "₹35k/mo · healthcare-heavy, own home",
    spending: { food: 10000, eating_out: 1000, housing: 5000, transport: 2000, communication: 800, healthcare: 10000, education: 0, clothing: 1500, furnishings: 800, personal_care: 1200, recreation: 1500, tobacco_alcohol: 1200 },
  },
];

type Diet = "veg" | "non-veg";

export default function Calculator({ categories }: { categories: CategoryDescriptor[] }) {
  const [spending, setSpending] = useState<Partial<Record<UserCategoryKey, number>>>({});
  const [sector, setSector] = useState<Sector>("combined");
  const [state, setState] = useState("All India");
  const [diet, setDiet] = useState<Diet>("veg");
  const [aiText, setAiText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, startParsingTransition] = useTransition();

  /* ── State-level async result ── */
  const [stateResult, setStateResult] = useState<any>(null);
  const [stateLoading, setStateLoading] = useState(false);
  const [stateError, setStateError] = useState<string | null>(null);

  /* ── Diet filter: drop non-veg sub-categories from spending when the
        user has selected a vegetarian diet so they don't sneak into the
        engine via stale keys. ── */
  const effectiveSpending = useMemo<Partial<Record<UserCategoryKey, number>>>(() => {
    if (diet === "non-veg") return spending;
    // Drop non-veg sub-categories so they don't contribute to the engine.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { food_meat: _m, food_seafood: _s, ...rest } = spending;
    return rest;
  }, [spending, diet]);

  /* ── All-India result (client-side, instant) ── */
  const allIndiaResult = useMemo(() => {
    const total = Object.values(effectiveSpending).reduce((s, v) => s + (v || 0), 0);
    if (total === 0) return null;
    const res = compute(effectiveSpending, undefined, sector);
    const series = computeMonthlySeries(effectiveSpending, 24, sector);
    return { ...res, monthly_series: series, state: "All India", state_code: 0, spending_raw: effectiveSpending };
  }, [effectiveSpending, sector]);

  /* ── Invalidate stale state result the moment inputs change so the UI
        stops showing yesterday's number while a new fetch runs ── */
  useEffect(() => {
    const stateCode = STATE_MAP[state];
    if (stateCode === 0 || stateCode === undefined) {
      setStateResult(null);
      setStateLoading(false);
      setStateError(null);
      return;
    }
    const total = Object.values(effectiveSpending).reduce((s, v) => s + (v || 0), 0);
    if (total === 0) {
      setStateResult(null);
      setStateLoading(false);
      setStateError(null);
      return;
    }
    setStateResult(null);
    setStateError(null);
    setStateLoading(true);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spending: effectiveSpending, sector, state_code: stateCode }),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.state_error) {
            setStateError(data.state_error);
            setStateResult({
              ...data,
              state: `${state} (All India fallback)`,
              state_code: 0,
              spending_raw: effectiveSpending,
            });
          } else {
            setStateResult({ ...data, state, state_code: stateCode, spending_raw: effectiveSpending });
          }
        } else {
          let message = `MoSPI request failed (HTTP ${res.status}).`;
          try {
            const errBody = await res.json();
            if (errBody?.error) message = errBody.error;
          } catch {
            /* ignore */
          }
          setStateError(message);
          setStateResult(null);
        }
      } catch (err) {
        if (!cancelled) {
          setStateError(err instanceof Error ? err.message : "Network error");
          setStateResult(null);
        }
      } finally {
        if (!cancelled) setStateLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, effectiveSpending, sector]);

  /* ── Choose which result to display ──
     When a state is selected, only show its result (or nothing while
     loading). Falling back to All India during a state fetch was
     misleading — users saw All India numbers under a "Gujarat" header. */
  const isStateSelected = STATE_MAP[state] !== 0;
  const result = isStateSelected ? stateResult : allIndiaResult;

  async function handleAiParse() {
    if (!aiText.trim()) return;
    setParseError(null);
    startParsingTransition(async () => {
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: aiText }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.error) {
            setParseError(data.error);
          } else {
            const { state: parsedState, sector: parsedSector, diet: parsedDiet, ...spendingFields } = data ?? {};
            setSpending(spendingFields);
            if (typeof parsedState === "string" && parsedState in STATE_MAP) {
              setState(parsedState);
            }
            if (parsedSector === "urban" || parsedSector === "rural" || parsedSector === "combined") {
              setSector(parsedSector);
            }
            if (parsedDiet === "veg" || parsedDiet === "non-veg") {
              setDiet(parsedDiet);
            }
            setAiText("");
          }
        } else {
          const err = await res.json().catch(() => ({ error: "Failed to parse your input. Try being more specific about amounts." }));
          setParseError(err.error || "Something went wrong. Please try again.");
        }
      } catch {
        setParseError("Network error. Please check your connection and try again.");
      }
    });
  }

  function setField(key: UserCategoryKey, value: string) {
    const n = value === "" ? undefined : Number(value);
    setSpending((s) => ({ ...s, [key]: Number.isFinite(n as number) ? (n as number) : undefined }));
  }

  function applyPreset(p: Preset) {
    setSpending(p.spending);
  }

  const total = Object.values(spending).reduce<number>(
    (s, v) => s + (typeof v === "number" && v > 0 ? v : 0),
    0,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr] xl:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col gap-6">
        
        {/* AI Input Box */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-1 backdrop-blur-md focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all">
          <div className="flex flex-col rounded-xl bg-zinc-950 p-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-400">
              <Sparkles className="h-4 w-4" /> Describe your lifestyle
            </label>
            <textarea
              rows={3}
              value={aiText}
              onChange={(e) => { setAiText(e.target.value); setParseError(null); }}
              placeholder="e.g. I live in Bangalore, pay 30k in rent, spend about 15k on food and ordering out, and maybe 5k on petrol."
              className="w-full resize-none bg-transparent text-zinc-200 placeholder-zinc-600 outline-none sm:text-lg"
            />
            {parseError && (
              <div className="mt-2 flex items-start gap-2 rounded-lg bg-rose-950/40 border border-rose-800/50 px-3 py-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-rose-400" />
                <span>{parseError}</span>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleAiParse}
                disabled={isParsing || !aiText.trim()}
                className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isParsing ? "Analyzing..." : "Auto-fill"}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 backdrop-blur-md">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Quick Profiles</h3>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-left transition-all hover:border-emerald-500/40 hover:bg-zinc-900"
              >
                <span className="mt-0.5 flex-shrink-0 text-emerald-500">{p.icon}</span>
                <div>
                  <div className="text-sm font-medium text-zinc-200">{p.label}</div>
                  <div className="text-[11px] text-zinc-500">{p.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Manual Inputs */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-2xl backdrop-blur-md">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Monthly Spending</h2>
            <div className="text-sm font-medium text-zinc-400">
              Total: <span className="text-white">₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap items-center gap-4">
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              State / UT
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Sector
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value as Sector)}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
              >
                <option value="combined">Combined</option>
                <option value="urban">Urban</option>
                <option value="rural">Rural</option>
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Diet
              <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setDiet("veg")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    diet === "veg"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Leaf className="h-3.5 w-3.5" /> Veg
                </button>
                <button
                  type="button"
                  onClick={() => setDiet("non-veg")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    diet === "non-veg"
                      ? "bg-rose-500/15 text-rose-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Drumstick className="h-3.5 w-3.5" /> Non-veg
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSpending({})}
              className="ml-auto mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white"
            >
              Reset
            </button>
          </div>

          {diet === "non-veg" && (
            <div className="mb-6 flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-400">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
              <div>
                Food sub-categories use CPI class-level data; finer breakdown (chicken vs mutton) is not available.
              </div>
            </div>
          )}

          <p className="mb-6 text-[11px] leading-relaxed text-zinc-500">
            All India numbers are pre-bundled from the snapshot. Picking a state
            triggers a live call to the{" "}
            <a
              href="https://esankhyiki.mospi.gov.in/macroindicators?product=cpi&tab=table"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
            >
              MoSPI eSankhyiki CPI API
            </a>{" "}
            (base 2024=100, COICOP 2018) to fetch that state&apos;s 13 division
            indices for the latest month and 12 months prior.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {categories
              .filter((c) => {
                if (c.key === "food_meat" || c.key === "food_seafood") return diet === "non-veg";
                return true;
              })
              .map((c) => (
              <label key={c.key} className="flex flex-col group">
                <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">{c.label}</span>
                <span className="mb-2 text-xs text-zinc-600 line-clamp-1" title={c.description}>{c.description}</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
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
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-8 pr-3 text-sm font-medium text-white outline-none ring-0 focus:border-emerald-500 transition-colors"
                  />
                </div>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="h-full">
        {stateLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-900/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching {state} CPI from the MoSPI eSankhyiki API…
          </div>
        )}
        {stateError && !stateLoading && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-800/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-400" />
            <div>
              <div className="font-medium text-rose-200">
                Couldn&apos;t load CPI data for {state}
              </div>
              <div className="mt-1 text-rose-300/90">{stateError}</div>
              <div className="mt-1 text-xs text-rose-400/80">
                Pick a different state, switch back to All India, or try again in a moment.
              </div>
            </div>
          </div>
        )}
        {result ? (
          <Results result={result as any} />
        ) : stateLoading ? (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-sm text-zinc-500">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-zinc-600" />
            <p className="mb-2 font-medium text-zinc-300">Calculating…</p>
            <p className="max-w-xs">
              Pulling division-level CPI for {state} ({sector}) from MoSPI.
            </p>
          </div>
        ) : (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center text-sm text-zinc-500">
            <Sparkles className="mb-4 h-8 w-8 text-zinc-700" />
            <p className="mb-2 font-medium text-zinc-300">Awaiting Data</p>
            <p className="max-w-xs mb-4">
              Tell us your lifestyle above or pick a quick profile to see your personal inflation immediately.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
