import { USER_CATEGORIES, type UserCategoryKey } from "@/lib/cpi/categories";
import { getLatestMonth } from "@/lib/cpi/snapshot";
import { fetchStatePairForYoY } from "@/lib/cpi/state-fetch";
import type { MonthKey, Sector } from "@/lib/cpi/types";
import type { SpendingInput, ComputeResult, CategoryResult, GapRow } from "./engine";
import stateWeightsJson from "@/data/cpi/state_weights.json";

export async function computeForState(
  spending: SpendingInput,
  stateCode: number,
  sector: Sector,
): Promise<ComputeResult> {
  const asOf = getLatestMonth();
  const { current, prior } = await fetchStatePairForYoY(stateCode, sector, asOf);

  const entries = USER_CATEGORIES.map((c) => {
    const raw = spending[c.key];
    const spend = typeof raw === "number" && raw > 0 && Number.isFinite(raw) ? raw : 0;
    return { cat: c, spend };
  });

  const total = entries.reduce((s, e) => s + e.spend, 0);
  const missing: UserCategoryKey[] = [];

  const categories: CategoryResult[] = entries.map(({ cat, spend }) => {
    const weight = total > 0 ? spend / total : 0;
    
    let curIndexTotal = 0;
    let priorIndexTotal = 0;
    let found = false;

    if (cat.foodClass && current.foodClasses?.[cat.foodClass]?.index != null && prior.foodClasses?.[cat.foodClass]?.index != null && prior.foodClasses[cat.foodClass].index > 0) {
      curIndexTotal = current.foodClasses[cat.foodClass].index;
      priorIndexTotal = prior.foodClasses[cat.foodClass].index;
      found = true;
    } else {
      for (const { subgroup, split } of cat.subgroups) {
        const curDiv = current.divisions.find((d) => d.key === subgroup);
        const priorDiv = prior.divisions.find((d) => d.key === subgroup);
        if (curDiv?.index != null && priorDiv?.index != null && priorDiv.index > 0) {
          curIndexTotal += split * curDiv.index;
          priorIndexTotal += split * priorDiv.index;
          found = true;
        }
      }
    }
    
    if (!found || priorIndexTotal === 0) {
      missing.push(cat.key);
      return { key: cat.key, label: cat.label, spend, weight, inflation: 0, contribution: 0 };
    }
    
    const inflation = (curIndexTotal / priorIndexTotal) - 1;
    return { key: cat.key, label: cat.label, spend, weight, inflation, contribution: weight * inflation };
  });

  const personal = categories.reduce((s, r) => s + r.contribution, 0);
  const official = current.generalInflation ?? 0;

  const drivers = categories
    .filter((r) => r.weight > 0)
    .slice()
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  const { SUBGROUP_SPECS } = await import("@/lib/cpi/transform");
  const stateWeights = (stateWeightsJson as Record<string, Record<string, Record<string, number>>>)[String(stateCode)]?.[sector] ?? {};

  const gap_decomposition: GapRow[] = entries.map(({ cat, spend }) => {
    const your_weight = total > 0 ? spend / total : 0;
    // Class-level food categories sit inside the Food division; using the
    // parent weight would double-count, and MoSPI doesn't publish class
    // weights at state level, so we report 0 for the national-weight
    // column on those rows.
    let state_weight = 0;
    if (!cat.foodClass) {
      for (const { subgroup } of cat.subgroups) {
        const spec = SUBGROUP_SPECS.find(s => s.key === subgroup);
        if (spec) {
          state_weight += stateWeights[spec.code] ?? 0;
        }
      }
    }

    const categoryResult = categories.find(c => c.key === cat.key);
    const yoy = categoryResult?.inflation ?? 0;

    const weight_diff = your_weight - state_weight;
    return {
      key: cat.key,
      label: cat.label,
      your_weight,
      national_weight: state_weight,
      weight_diff,
      category_yoy: yoy,
      gap_contribution: weight_diff * yoy,
    };
  });

  return {
    as_of_month: asOf,
    base_year: 2024,
    sector,
    total_spend: total,
    personal_inflation: personal,
    official_inflation: official,
    official_headline: official,
    gap: personal - official,
    categories,
    top_drivers: drivers,
    missing_categories: missing,
    gap_decomposition,
  };
}
