import type { CpiSnapshot, MonthKey, Sector, CpiSectorData } from "@/lib/cpi/types";

interface CanonicalRow {
  sector: string;
  divisionName: string;
  /** When this row is a class/sub-class level, holds the class label. */
  className: string | null;
  /** When this row is a class-level row, holds its parent group label. */
  groupName: string | null;
  /** True for sub-class rows (we don't currently store these, but flag them). */
  isSubClass: boolean;
  code: string | null;
  indexValue: number;
  inflationPct: number | null;
  isGeneral: boolean;
}

interface SubgroupSpec {
  key: string;
  label: string;
  weight: number;
  code: string;
  matchNames: string[];
}

export const SUBGROUP_SPECS: SubgroupSpec[] = [
  { key: "food_and_beverages",        code: "01", label: "Food and beverages",                                                  weight: 0.3968, matchNames: ["food and beverages", "food & beverages"] },
  { key: "pan_tobacco_and_intoxicants", code: "02", label: "Paan, tobacco and intoxicants",                                       weight: 0.0213, matchNames: ["paan, tobacco and intoxicants", "pan, tobacco and intoxicants", "paan tobacco and intoxicants", "pan tobacco and intoxicants"] },
  { key: "clothing_and_footwear",     code: "03", label: "Clothing and footwear",                                               weight: 0.0653, matchNames: ["clothing and footwear", "clothing & footwear"] },
  { key: "housing_utilities",         code: "04", label: "Housing, water, electricity, gas and other fuels",                    weight: 0.1527, matchNames: ["housing, water, electricity, gas and other fuels", "housing water electricity gas and other fuels"] },
  { key: "furnishings_household",     code: "05", label: "Furnishings, household equipment and routine household maintenance",  weight: 0.0380, matchNames: ["furnishings, household equipment and routine household maintenance", "furnishings household equipment and routine household maintenance"] },
  { key: "health",                    code: "06", label: "Health",                                                              weight: 0.0589, matchNames: ["health"] },
  { key: "transport",                 code: "07", label: "Transport",                                                           weight: 0.0630, matchNames: ["transport"] },
  { key: "information_communication", code: "08", label: "Information and communication",                                       weight: 0.0259, matchNames: ["information and communication", "information & communication"] },
  { key: "recreation_culture",        code: "09", label: "Recreation, sport and culture",                                       weight: 0.0168, matchNames: ["recreation, sport and culture", "recreation sport and culture"] },
  { key: "education_services",        code: "10", label: "Education services",                                                  weight: 0.0446, matchNames: ["education services", "education"] },
  { key: "restaurants_accommodation", code: "11", label: "Restaurants and accommodation services",                              weight: 0.0263, matchNames: ["restaurants and accommodation services", "restaurants & accommodation services"] },
  { key: "personal_care_misc",        code: "12", label: "Personal care, social protection and miscellaneous goods and services", weight: 0.0904, matchNames: ["personal care, social protection and miscellaneous goods and services", "personal care social protection and miscellaneous goods and services"] },
];

const KEY_CANDIDATES = {
  sector:       ["sector", "geography", "area", "region"],
  division:     ["division", "group_name", "group", "groupName", "main_group", "category"],
  subgroup:     ["group", "subgroup_name", "sub_group_name", "sub_group", "subgroup", "subgroupName"],
  klass:        ["class", "klass"],
  subClass:     ["sub_class", "subclass"],
  item:         ["item"],
  index:        ["index", "index_value", "indexvalue", "value", "cpi_index", "all_india_index"],
  inflation:    ["inflation", "inflation_rate"],
  code:         ["code", "division_code"],
  baseYear:     ["base_year", "baseyear", "base"],
  year:         ["year"],
  monthCode:    ["month_code", "monthcode", "month"],
};

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in row) return row[key];
    const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

function asString(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s.length === 0 ? null : s;
}

function asNumber(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").replace(/&/g, "and").trim();
}

/** Food class codes we want to keep (COICOP class level under division 01). */
export const FOOD_CLASS_CODE_RE = /^01\.\d+\.\d+$/;

export function canonicalizeRow(row: Record<string, unknown>): CanonicalRow | null {
  const sector = asString(pickField(row, KEY_CANDIDATES.sector)) ?? "";
  const division = asString(pickField(row, KEY_CANDIDATES.division));
  const indexValue = asNumber(pickField(row, KEY_CANDIDATES.index));
  const code = asString(pickField(row, KEY_CANDIDATES.code));
  const groupName = asString(pickField(row, KEY_CANDIDATES.subgroup));
  const klass = asString(pickField(row, KEY_CANDIDATES.klass));
  const subClass = asString(pickField(row, KEY_CANDIDATES.subClass));
  const item = asString(pickField(row, KEY_CANDIDATES.item));
  const inflationPct = asNumber(pickField(row, KEY_CANDIDATES.inflation));

  if (!division || indexValue == null) return null;
  const isGeneral = normalize(division).includes("cpi (general)") || normalize(division) === "general";

  // We keep:
  //  • the General row
  //  • pure division rows (no group/class/sub_class/item)
  //  • food *class* rows (codes 01.X.Y) — for dietary breakdown
  //
  // Everything else (sub_class rows, item rows, non-food groups) is dropped
  // to keep the snapshot small and focused.
  if (item || subClass) return null;
  const isFoodClass = !!(code && FOOD_CLASS_CODE_RE.test(code) && klass);
  if (!isGeneral && !isFoodClass && (groupName || klass)) return null;

  return {
    sector,
    divisionName: division,
    className: isFoodClass ? klass : null,
    groupName: isFoodClass ? groupName : null,
    isSubClass: false,
    code,
    indexValue,
    inflationPct,
    isGeneral,
  };
}

export function pickIndexForSubgroup(rows: CanonicalRow[], spec: SubgroupSpec): number | null {
  const byCode = rows.find((r) => r.code === spec.code);
  if (byCode) return byCode.indexValue;
  const targetNames = spec.matchNames.map(normalize);
  const match = rows.find((r) => targetNames.includes(normalize(r.divisionName)));
  return match?.indexValue ?? null;
}

export function pickHeadline(rows: CanonicalRow[]): { index: number | null; inflation: number | null } {
  const m = rows.find((r) => normalize(r.divisionName).includes("cpi (general)") || normalize(r.divisionName) === "general");
  return { index: m?.indexValue ?? null, inflation: m?.inflationPct ?? null };
}

const SECTOR_NAMES: Record<Sector, string[]> = {
  combined: ["combined", "rural+urban combined", "all-india"],
  urban: ["urban"],
  rural: ["rural"],
};

function rowsForSector(rows: CanonicalRow[], sector: Sector): CanonicalRow[] {
  const targets = SECTOR_NAMES[sector];
  return rows.filter((r) => targets.includes(normalize(r.sector)));
}

export interface BuildSnapshotInput {
  asOfMonth: MonthKey;
  baseYear: number;
  monthlyRows: Record<MonthKey, CanonicalRow[]>;
  sourceUrl: string;
  series_id?: string;
  description?: string;
  source?: string;
  provenance_note?: string;
}

function buildSectorData(rowsByMonth: Record<MonthKey, CanonicalRow[]>, sector: Sector): CpiSectorData {
  const indices: Record<string, Record<MonthKey, number>> = {};
  const general_index: Record<MonthKey, number> = {};
  for (const spec of SUBGROUP_SPECS) {
    indices[spec.key] = {};
    for (const [month, allRows] of Object.entries(rowsByMonth)) {
      const sectorRows = rowsForSector(allRows, sector);
      const value = pickIndexForSubgroup(sectorRows, spec);
      if (value != null) indices[spec.key][month as MonthKey] = round3(value);
    }
  }
  for (const [month, allRows] of Object.entries(rowsByMonth)) {
    const sectorRows = rowsForSector(allRows, sector);
    const gen = sectorRows.find((r) => r.isGeneral);
    if (gen) general_index[month as MonthKey] = round3(gen.indexValue);
  }
  const subgroups = Object.fromEntries(
    SUBGROUP_SPECS.map((s) => [s.key, { label: s.label, weight: s.weight, code: s.code }]),
  );

  // Collect food-class rows per code across months.
  const food_classes: NonNullable<CpiSectorData["food_classes"]> = {};
  for (const [month, allRows] of Object.entries(rowsByMonth)) {
    const sectorRows = rowsForSector(allRows, sector);
    for (const r of sectorRows) {
      if (!r.code || !r.className || !FOOD_CLASS_CODE_RE.test(r.code)) continue;
      const entry = food_classes[r.code] ?? {
        meta: { label: r.className, group: r.groupName ?? undefined, code: r.code },
        series: {} as Record<MonthKey, number>,
      };
      entry.series[month as MonthKey] = round3(r.indexValue);
      food_classes[r.code] = entry;
    }
  }

  return {
    subgroups,
    indices,
    general_index,
    ...(Object.keys(food_classes).length > 0 ? { food_classes } : {}),
  };
}

export function buildSnapshot(input: BuildSnapshotInput): CpiSnapshot {
  const sectors: Record<Sector, CpiSectorData> = {
    combined: buildSectorData(input.monthlyRows, "combined"),
    urban: buildSectorData(input.monthlyRows, "urban"),
    rural: buildSectorData(input.monthlyRows, "rural"),
  };

  const headline: Partial<Record<Sector, number>> = {};
  const asOfRows = input.monthlyRows[input.asOfMonth] ?? [];
  for (const sector of ["combined", "urban", "rural"] as Sector[]) {
    const h = pickHeadline(rowsForSector(asOfRows, sector));
    if (h.inflation != null) headline[sector] = round3(h.inflation / 100);
  }

  return {
    series_id: input.series_id ?? "india-cpi-2024",
    description:
      input.description ??
      `India CPI (Combined / Urban / Rural) — division indices, base ${input.baseYear}=100 (COICOP 2018)`,
    source: input.source ?? "Ministry of Statistics and Programme Implementation (MoSPI), Government of India",
    source_url: input.sourceUrl,
    base_year: input.baseYear,
    as_of_month: input.asOfMonth,
    frequency: "monthly",
    currency_unit: `index (base ${input.baseYear} = 100)`,
    provenance_note:
      input.provenance_note ??
      `Auto-refreshed from MoSPI eSankhyiki CPI API on ${new Date().toISOString().slice(0, 10)}. Division weights are MoSPI's published 2024-base CPI weights derived from HCES 2023-24 (COICOP 2018 framework).`,
    official_headline: headline,
    sectors,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
