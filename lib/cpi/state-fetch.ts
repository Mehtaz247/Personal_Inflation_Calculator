import { fetchCpiMonth } from "@/lib/cpi/sources/mospi-api";
import { canonicalizeRow, pickIndexForSubgroup, pickHeadline, SUBGROUP_SPECS } from "@/lib/cpi/transform";
import type { MonthKey, Sector } from "@/lib/cpi/types";

const SECTOR_MAP: Record<Sector, string> = { combined: "3", urban: "2", rural: "1" };

export interface StateDivisionData {
  generalIndex: number | null;
  generalInflation: number | null;
  divisions: Array<{ key: string; index: number; yoy: number | null }>;
}

export async function fetchStateDivisions(
  stateCode: number,
  sector: Sector,
  year: number,
  monthCode: number,
): Promise<StateDivisionData> {
  const res = await fetchCpiMonth({
    base_year: 2024,
    year,
    month_code: monthCode,
    limit: 100,
    sector: SECTOR_MAP[sector],
    state_code: stateCode,
  });

  const canonical = res.rows.map(canonicalizeRow).filter((r): r is NonNullable<typeof r> => r != null);
  const sectorRows = canonical.filter((r) => {
    const s = r.sector.toLowerCase();
    return (sector === "combined" && s === "combined") ||
           (sector === "urban" && s === "urban") ||
           (sector === "rural" && s === "rural");
  });

  const headline = pickHeadline(sectorRows);
  const divisions: StateDivisionData["divisions"] = [];
  for (const spec of SUBGROUP_SPECS) {
    const idx = pickIndexForSubgroup(sectorRows, spec);
    if (idx != null) {
      const row = sectorRows.find((r) =>
        r.code === spec.code ||
        spec.matchNames.some((n) => r.divisionName.toLowerCase().includes(n))
      );
      divisions.push({ key: spec.key, index: idx, yoy: row?.inflationPct != null ? row.inflationPct / 100 : null });
    }
  }

  return {
    generalIndex: headline.index,
    generalInflation: headline.inflation != null ? headline.inflation / 100 : null,
    divisions,
  };
}

export async function fetchStatePairForYoY(
  stateCode: number,
  sector: Sector,
  asOfMonth: MonthKey,
): Promise<{ current: StateDivisionData; prior: StateDivisionData }> {
  const [y, mm] = asOfMonth.split("-").map(Number);
  const [current, prior] = await Promise.all([
    fetchStateDivisions(stateCode, sector, y, mm),
    fetchStateDivisions(stateCode, sector, y - 1, mm),
  ]);
  return { current, prior };
}
