import snapshotJson from "@/data/cpi/cpi-combined-2024.json";
import type { CpiSnapshot, MonthKey, SubgroupKey } from "./types";
import { cpiSnapshotSchema } from "./schema";

// Validate on module load. If the JSON drifts out of shape (MoSPI format
// change, bad ingest), we want to fail loudly with a useful error rather
// than compute silently wrong numbers.
const parsed = cpiSnapshotSchema.safeParse(snapshotJson);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid CPI snapshot:\n${issues}`);
}
const snapshot = parsed.data as unknown as CpiSnapshot;

export function getSnapshot(): CpiSnapshot {
  return snapshot;
}

export function getLatestMonth(): MonthKey {
  return snapshot.as_of_month;
}

function shiftYear(month: MonthKey, years: number): MonthKey {
  const [y, m] = month.split("-");
  return `${Number(y) + years}-${m}` as MonthKey;
}

/**
 * YoY inflation for a subgroup at a given month.
 * Uses index-level math: (index_m / index_{m minus 12}) - 1.
 * Returns null when the prior-year reading is missing — callers must handle.
 */
export function subgroupYoY(
  subgroup: SubgroupKey | string,
  month: MonthKey = snapshot.as_of_month,
): number | null {
  const series = snapshot.indices[subgroup];
  if (!series) return null;
  const current = series[month];
  const prior = series[shiftYear(month, -1)];
  if (current == null || prior == null || prior === 0) return null;
  return current / prior - 1;
}

/**
 * Official headline CPI YoY — weighted combination of subgroup YoY using the
 * weights stored in the snapshot. Keeping this derived (rather than hardcoded)
 * means refreshing weights in the JSON automatically refreshes the headline.
 */
export function headlineYoY(month: MonthKey = snapshot.as_of_month): number {
  let total = 0;
  for (const [key, meta] of Object.entries(snapshot.subgroups)) {
    const r = subgroupYoY(key, month);
    if (r == null) continue;
    total += meta.weight * r;
  }
  return total;
}

export function listSubgroups(): Array<{ key: string; label: string; weight: number }> {
  return Object.entries(snapshot.subgroups).map(([key, m]) => ({
    key,
    label: m.label,
    weight: m.weight,
  }));
}
