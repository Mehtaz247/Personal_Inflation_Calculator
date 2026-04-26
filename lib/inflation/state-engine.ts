import { USER_CATEGORIES, type UserCategoryKey } from "@/lib/cpi/categories";
import { getLatestMonth } from "@/lib/cpi/snapshot";
import { fetchStatePairForYoY } from "@/lib/cpi/state-fetch";
import type { MonthKey, Sector } from "@/lib/cpi/types";
import type { SpendingInput, ComputeResult, CategoryResult, GapRow } from "./engine";

export async function computeForState(
  spending: SpendingInput,
  stateCode: number,
  sector: Sector,
): Promise<ComputeResult> {
  const asOf = getLatestMonth();
  const { current, prior } = await fetchStatePairForYoY(stateCode, sector, asOf);

  const divisionYoY: Record<string, number> = {};
  for (const div of current.divisions) {
    if (div.yoy != null) {
      divisionYoY[div.key] = div.yoy;
    } else {
      const priorDiv = prior.divisions.find((p) => p.key === div.key);
      if (priorDiv && priorDiv.index > 0) {
        divisionYoY[div.key] = div.index / priorDiv.index - 1;
      }
    }
  }

  const entries = USER_CATEGORIES.map((c) => {
    const raw = spending[c.key];
    const spend = typeof raw === "number" && raw > 0 && Number.isFinite(raw) ? raw : 0;
    return { cat: c, spend };
  });

  const total = entries.reduce((s, e) => s + e.spend, 0);
  const missing: UserCategoryKey[] = [];

  const categories: CategoryResult[] = entries.map(({ cat, spend }) => {
    const weight = total > 0 ? spend / total : 0;
    let inflation = 0;
    let found = false;
    for (const { subgroup, split } of cat.subgroups) {
      const yoy = divisionYoY[subgroup];
      if (yoy != null) {
        inflation += split * yoy;
        found = true;
      }
    }
    if (!found) missing.push(cat.key);
    return { key: cat.key, label: cat.label, spend, weight, inflation, contribution: weight * inflation };
  });

  const personal = categories.reduce((s, r) => s + r.contribution, 0);
  const official = current.generalInflation ?? 0;

  const drivers = categories
    .filter((r) => r.weight > 0)
    .slice()
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  const nationalWeights: Record<string, number> = {};
  for (const spec of (await import("@/lib/cpi/transform")).SUBGROUP_SPECS) {
    nationalWeights[spec.key] = spec.weight;
  }

  const gap_decomposition: GapRow[] = entries.map(({ cat, spend }) => {
    const your_weight = total > 0 ? spend / total : 0;
    let national_weight = 0;
    for (const { subgroup } of cat.subgroups) {
      national_weight += nationalWeights[subgroup] ?? 0;
    }
    let yoy = 0;
    for (const { subgroup, split } of cat.subgroups) {
      yoy += split * (divisionYoY[subgroup] ?? 0);
    }
    const weight_diff = your_weight - national_weight;
    return {
      key: cat.key,
      label: cat.label,
      your_weight,
      national_weight,
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
