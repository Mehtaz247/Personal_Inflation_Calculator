import snapshotJson from "@/data/cpi/cpi-combined-2024.json";
import type { CpiSnapshot, MonthKey, Sector } from "./types";
import { cpiSnapshotSchema } from "./schema";

const parsed = cpiSnapshotSchema.safeParse(snapshotJson);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid CPI snapshot:\n${issues}`);
}
const snapshot = parsed.data as unknown as CpiSnapshot;

export const DEFAULT_SECTOR: Sector = "combined";

export function getSnapshot(): CpiSnapshot {
  return snapshot;
}

export function getLatestMonth(): MonthKey {
  return snapshot.as_of_month;
}

export function getOfficialHeadline(sector: Sector = DEFAULT_SECTOR): number | undefined {
  return snapshot.official_headline?.[sector];
}

function shiftYear(month: MonthKey, years: number): MonthKey {
  const [y, m] = month.split("-");
  return `${Number(y) + years}-${m}` as MonthKey;
}

export function subgroupYoY(
  subgroup: string,
  month: MonthKey = snapshot.as_of_month,
  sector: Sector = DEFAULT_SECTOR,
): number | null {
  const series = snapshot.sectors[sector]?.indices[subgroup];
  if (!series) return null;
  const current = series[month];
  const prior = series[shiftYear(month, -1)];
  if (current == null || prior == null || prior === 0) return null;
  return current / prior - 1;
}

export function headlineYoY(
  month: MonthKey = snapshot.as_of_month,
  sector: Sector = DEFAULT_SECTOR,
): number {
  const sec = snapshot.sectors[sector];
  if (!sec) return 0;
  const gi = sec.general_index;
  if (gi) {
    const cur = gi[month];
    const prior = gi[shiftYear(month, -1)];
    if (cur != null && prior != null && prior > 0) return cur / prior - 1;
  }
  return weightedAvgYoY(month, sector);
}

export function weightedAvgYoY(
  month: MonthKey = snapshot.as_of_month,
  sector: Sector = DEFAULT_SECTOR,
): number {
  const sec = snapshot.sectors[sector];
  if (!sec) return 0;
  let total = 0;
  for (const [key, meta] of Object.entries(sec.subgroups)) {
    const r = subgroupYoY(key, month, sector);
    if (r == null) continue;
    total += meta.weight * r;
  }
  return total;
}

export function listSubgroups(sector: Sector = DEFAULT_SECTOR): Array<{ key: string; label: string; weight: number }> {
  const sec = snapshot.sectors[sector];
  if (!sec) return [];
  return Object.entries(sec.subgroups).map(([key, m]) => ({ key, label: m.label, weight: m.weight }));
}

export function getSubgroupWeight(key: string, sector: Sector = DEFAULT_SECTOR): number {
  return snapshot.sectors[sector]?.subgroups[key]?.weight ?? 0;
}

export function listAvailableMonths(sector: Sector = DEFAULT_SECTOR): MonthKey[] {
  const sec = snapshot.sectors[sector];
  if (!sec) return [];
  const months = new Set<string>();
  for (const series of Object.values(sec.indices)) {
    for (const m of Object.keys(series)) months.add(m);
  }
  return Array.from(months).sort() as MonthKey[];
}
