/**
 * Transform MoSPI eSankhyiki CPI API rows into our CpiSnapshot JSON shape.
 *
 * Two unknowns until we see a real response:
 *   1. The exact field names (e.g. `index_value` vs `cpi_index` vs `value`).
 *   2. How groups vs subgroups are distinguished (level field, group_code,
 *      or just a flat name).
 *
 * Strategy: pick the fields by best-effort key matching against a list of
 * common candidates, and if a field can't be located on a row we throw
 * with the row's actual keys. This way the first real run either succeeds
 * or tells us exactly what to add to the candidate lists.
 */

import type { CpiSnapshot, MonthKey } from "@/lib/cpi/types";

interface CanonicalRow {
  sector: string;
  groupName: string;
  subgroupName: string | null;
  indexValue: number;
}

interface SubgroupSpec {
  key: string;             // our internal key
  label: string;
  weight: number;
  level: "group" | "subgroup";
  matchNames: string[];    // tolerate spelling/punctuation variants
}

/**
 * Mapping from our internal subgroup keys to the MoSPI label they should
 * match. `level` distinguishes top-level groups (e.g. "Food and beverages")
 * from subgroups under Miscellaneous (e.g. "Health"). Weights here are the
 * official 2012-base weights as placeholders — refresh updates them from
 * the API too if the API returns weights, otherwise they stay as configured.
 */
export const SUBGROUP_SPECS: SubgroupSpec[] = [
  { key: "food_and_beverages",           label: "Food and beverages",           weight: 0.4587, level: "group",    matchNames: ["food and beverages", "food & beverages"] },
  { key: "pan_tobacco_and_intoxicants",  label: "Pan, tobacco and intoxicants", weight: 0.0238, level: "group",    matchNames: ["pan, tobacco and intoxicants", "pan tobacco and intoxicants", "pan, tobacco & intoxicants"] },
  { key: "clothing_and_footwear",        label: "Clothing and footwear",        weight: 0.0653, level: "group",    matchNames: ["clothing and footwear", "clothing & footwear"] },
  { key: "housing",                      label: "Housing",                      weight: 0.1007, level: "group",    matchNames: ["housing"] },
  { key: "fuel_and_light",               label: "Fuel and light",               weight: 0.0684, level: "group",    matchNames: ["fuel and light", "fuel & light"] },
  { key: "household_goods_and_services", label: "Household goods and services", weight: 0.0380, level: "subgroup", matchNames: ["household goods and services", "household goods & services"] },
  { key: "health",                       label: "Health",                       weight: 0.0589, level: "subgroup", matchNames: ["health"] },
  { key: "transport_and_communication",  label: "Transport and communication",  weight: 0.0859, level: "subgroup", matchNames: ["transport and communication", "transport & communication"] },
  { key: "recreation_and_amusement",     label: "Recreation and amusement",     weight: 0.0168, level: "subgroup", matchNames: ["recreation and amusement", "recreation & amusement"] },
  { key: "education",                    label: "Education",                    weight: 0.0446, level: "subgroup", matchNames: ["education"] },
  { key: "personal_care_and_effects",    label: "Personal care and effects",    weight: 0.0389, level: "subgroup", matchNames: ["personal care and effects", "personal care & effects"] },
];

const KEY_CANDIDATES = {
  sector:       ["sector", "geography", "area", "region"],
  group:        ["group_name", "group", "groupName", "main_group"],
  subgroup:     ["subgroup_name", "sub_group_name", "sub_group", "subgroup", "subgroupName"],
  index:        ["index_value", "indexvalue", "value", "cpi_index", "index", "all_india_index"],
  baseYear:     ["base_year", "baseyear", "base"],
  year:         ["year"],
  monthCode:    ["month_code", "monthcode", "month"],
  monthName:    ["month_name", "monthname"],
};

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in row) return row[key];
    // case-insensitive fallback
    const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found) return row[found];
  }
  return undefined;
}

function asString(x: unknown): string | null {
  if (x == null) return null;
  return String(x).trim();
}

function asNumber(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").replace(/&/g, "and").trim();
}

export function canonicalizeRow(row: Record<string, unknown>): CanonicalRow | null {
  const sector = asString(pickField(row, KEY_CANDIDATES.sector)) ?? "";
  const group = asString(pickField(row, KEY_CANDIDATES.group));
  const subgroup = asString(pickField(row, KEY_CANDIDATES.subgroup));
  const indexValue = asNumber(pickField(row, KEY_CANDIDATES.index));

  if (!group || indexValue == null) return null;
  return {
    sector,
    groupName: group,
    subgroupName: subgroup && subgroup !== group ? subgroup : null,
    indexValue,
  };
}

/**
 * Find the index value for a given subgroup spec from a list of canonical
 * rows for one month + sector. Returns null if not found.
 */
export function pickIndexForSubgroup(
  rows: CanonicalRow[],
  spec: SubgroupSpec,
): number | null {
  const targetNames = spec.matchNames.map(normalize);
  const match = rows.find((r) => {
    const name = normalize(spec.level === "group" ? r.groupName : r.subgroupName ?? "");
    return targetNames.includes(name);
  });
  return match?.indexValue ?? null;
}

export interface BuildSnapshotInput {
  asOfMonth: MonthKey;
  baseYear: number;
  sector: string;
  /** rows keyed by `${year}-${MM}` */
  monthlyRows: Record<MonthKey, CanonicalRow[]>;
  sourceUrl: string;
  series_id?: string;
  description?: string;
  source?: string;
  provenance_note?: string;
}

export function buildSnapshot(input: BuildSnapshotInput): CpiSnapshot {
  const indices: Record<string, Record<MonthKey, number>> = {};
  for (const spec of SUBGROUP_SPECS) {
    indices[spec.key] = {};
    for (const [month, rows] of Object.entries(input.monthlyRows)) {
      const sectorRows = rows.filter(
        (r) => normalize(r.sector) === normalize(input.sector) || r.sector === "",
      );
      const value = pickIndexForSubgroup(sectorRows, spec);
      if (value != null) indices[spec.key][month as MonthKey] = round3(value);
    }
  }

  const subgroups = Object.fromEntries(
    SUBGROUP_SPECS.map((s) => [s.key, { label: s.label, weight: s.weight }]),
  );

  return {
    series_id: input.series_id ?? "india-cpi-combined-2024",
    description:
      input.description ??
      `India CPI (${input.sector}) — subgroup indices, base ${input.baseYear}=100`,
    source: input.source ?? "Ministry of Statistics and Programme Implementation (MoSPI), Government of India",
    source_url: input.sourceUrl,
    base_year: input.baseYear,
    as_of_month: input.asOfMonth,
    frequency: "monthly",
    currency_unit: `index (base ${input.baseYear} = 100)`,
    provenance_note:
      input.provenance_note ??
      `Auto-refreshed from MoSPI eSankhyiki CPI API on ${new Date().toISOString().slice(0, 10)}.`,
    subgroups,
    indices,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
