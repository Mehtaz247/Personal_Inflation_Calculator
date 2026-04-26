import { USER_CATEGORIES, type UserCategoryKey } from "@/lib/cpi/categories";
import { headlineYoY, subgroupYoY, getLatestMonth } from "@/lib/cpi/snapshot";
import type { MonthKey } from "@/lib/cpi/types";

export type SpendingInput = Partial<Record<UserCategoryKey, number>>;

export interface CategoryResult {
  key: UserCategoryKey;
  label: string;
  spend: number;
  weight: number;            // share of the user's total spend
  inflation: number;         // YoY rate for this bucket (blended across subgroups)
  contribution: number;      // weight * inflation — points contributed to personal inflation
}

export interface ComputeResult {
  as_of_month: MonthKey;
  base_year: number;
  total_spend: number;
  personal_inflation: number;
  official_inflation: number;
  gap: number;               // personal - official
  categories: CategoryResult[];
  top_drivers: CategoryResult[];
  missing_categories: UserCategoryKey[];
}

function bucketInflation(categoryKey: UserCategoryKey, month: MonthKey): number | null {
  const cat = USER_CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return null;
  let total = 0;
  let used = 0;
  for (const { subgroup, split } of cat.subgroups) {
    const r = subgroupYoY(subgroup, month);
    if (r == null) continue;
    total += split * r;
    used += split;
  }
  if (used === 0) return null;
  // Re-normalize in case some subgroup was missing.
  return total / used;
}

export function compute(spending: SpendingInput, month?: MonthKey): ComputeResult {
  const asOf = month ?? getLatestMonth();
  const entries = USER_CATEGORIES.map((c) => {
    const raw = spending[c.key];
    const spend = typeof raw === "number" && raw > 0 && Number.isFinite(raw) ? raw : 0;
    return { cat: c, spend };
  });

  const total = entries.reduce((s, e) => s + e.spend, 0);

  const missing: UserCategoryKey[] = [];
  const categories: CategoryResult[] = entries.map(({ cat, spend }) => {
    const weight = total > 0 ? spend / total : 0;
    const inflation = bucketInflation(cat.key, asOf);
    if (inflation == null) missing.push(cat.key);
    const infl = inflation ?? 0;
    return {
      key: cat.key,
      label: cat.label,
      spend,
      weight,
      inflation: infl,
      contribution: weight * infl,
    };
  });

  const personal = categories.reduce((s, r) => s + r.contribution, 0);
  const official = headlineYoY(asOf);

  const drivers = categories
    .filter((r) => r.weight > 0)
    .slice()
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);

  return {
    as_of_month: asOf,
    base_year: 2024,
    total_spend: total,
    personal_inflation: personal,
    official_inflation: official,
    gap: personal - official,
    categories,
    top_drivers: drivers,
    missing_categories: missing,
  };
}
