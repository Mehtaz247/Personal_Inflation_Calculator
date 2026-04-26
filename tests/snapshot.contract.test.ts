import { describe, it, expect } from "vitest";
import { getSnapshot, subgroupYoY } from "@/lib/cpi/snapshot";
import { USER_CATEGORIES } from "@/lib/cpi/categories";

/**
 * Contract tests: invariants the CPI snapshot must hold so the app's
 * numbers stay trustworthy. A failure here means the data is wrong, not
 * the code.
 */
describe("CPI snapshot contract", () => {
  const snap = getSnapshot();

  it("declares a recognisable series and base year", () => {
    expect(snap.series_id.length).toBeGreaterThan(0);
    expect(snap.base_year).toBeGreaterThanOrEqual(2000);
    expect(snap.base_year).toBeLessThanOrEqual(2100);
    expect(snap.as_of_month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it("subgroup weights sum to 1", () => {
    const total = Object.values(snap.subgroups).reduce((s, m) => s + m.weight, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it("every subgroup has a strictly positive index for every month it declares", () => {
    for (const [key, series] of Object.entries(snap.indices)) {
      for (const [month, value] of Object.entries(series)) {
        expect(Number.isFinite(value), `${key}@${month} is not finite`).toBe(true);
        expect(value, `${key}@${month} must be > 0`).toBeGreaterThan(0);
      }
    }
  });

  it("the as_of_month has a value for every declared subgroup", () => {
    for (const key of Object.keys(snap.subgroups)) {
      expect(snap.indices[key]?.[snap.as_of_month]).toBeGreaterThan(0);
    }
  });

  it("YoY can be computed for every subgroup at as_of_month", () => {
    for (const key of Object.keys(snap.subgroups)) {
      const r = subgroupYoY(key, snap.as_of_month);
      expect(r, `YoY missing for subgroup ${key}`).not.toBeNull();
    }
  });

  it("every subgroup's YoY at as_of_month is within a plausible band (±50%)", () => {
    // Catches mis-keyed data, e.g. raw percentages stored instead of indices,
    // or prior-year month being accidentally swapped.
    for (const key of Object.keys(snap.subgroups)) {
      const r = subgroupYoY(key, snap.as_of_month)!;
      expect(Math.abs(r), `YoY for ${key} implausible: ${r}`).toBeLessThan(0.5);
    }
  });

  it("every user category maps only to subgroups that exist in the snapshot", () => {
    for (const cat of USER_CATEGORIES) {
      for (const { subgroup, split } of cat.subgroups) {
        expect(snap.subgroups[subgroup], `${cat.key} -> unknown subgroup ${subgroup}`)
          .toBeDefined();
        expect(split).toBeGreaterThan(0);
        expect(split).toBeLessThanOrEqual(1);
      }
      const splitSum = cat.subgroups.reduce((s, x) => s + x.split, 0);
      expect(splitSum, `${cat.key} splits must sum to 1`).toBeCloseTo(1, 6);
    }
  });
});
