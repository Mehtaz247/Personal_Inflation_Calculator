import { describe, it, expect } from "vitest";
import { compute, decomposeGap, computeMonthlySeries } from "@/lib/inflation/engine";
import {
  headlineYoY,
  subgroupYoY,
  getLatestMonth,
  weightedAvgYoY,
  getSnapshot,
  foodClassYoY,
} from "@/lib/cpi/snapshot";

describe("CPI snapshot", () => {
  it("exposes a latest month", () => {
    expect(getLatestMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it("computes subgroup YoY from index ratios", () => {
    const food = subgroupYoY("food_and_beverages");
    expect(food).not.toBeNull();
    expect(Math.abs(food!)).toBeLessThan(0.5);
  });

  it("headline YoY is a finite number within plausible band", () => {
    const h = headlineYoY();
    expect(Number.isFinite(h)).toBe(true);
    expect(Math.abs(h)).toBeLessThan(0.5);
  });

  it("headline YoY matches the official MoSPI headline within ±0.01pp", () => {
    const snap = getSnapshot();
    const officialCombined = snap.official_headline?.combined;
    if (officialCombined != null) {
      const computed = headlineYoY(snap.as_of_month, "combined");
      expect(computed).toBeCloseTo(officialCombined, 3);
    }
  });
});

describe("inflation engine", () => {
  it("returns zero personal inflation for empty spending", () => {
    const r = compute({});
    expect(r.personal_inflation).toBe(0);
    expect(r.total_spend).toBe(0);
  });

  it("a food-only household has personal inflation equal to food YoY", () => {
    const r = compute({ food: 10000 });
    const expected = subgroupYoY("food_and_beverages")!;
    expect(r.personal_inflation).toBeCloseTo(expected, 6);
    expect(r.categories.find((c) => c.key === "food")!.weight).toBe(1);
  });

  it("personal inflation equals sum of weight * category_inflation", () => {
    const r = compute({ food: 10000, housing: 10000, healthcare: 5000 });
    const recomputed = r.categories.reduce((s, c) => s + c.weight * c.inflation, 0);
    expect(r.personal_inflation).toBeCloseTo(recomputed, 10);
  });

  it("gap equals personal minus official", () => {
    const r = compute({ food: 10000, housing: 5000 });
    expect(r.gap).toBeCloseTo(r.personal_inflation - r.official_inflation, 10);
  });

  it("top drivers are ordered by absolute contribution", () => {
    const r = compute({ food: 50000, housing: 10000, education: 2000 });
    const sorted = [...r.top_drivers].sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
    );
    expect(r.top_drivers).toEqual(sorted);
  });

  it("weights across categories sum to 1 when spending > 0", () => {
    const r = compute({ food: 10000, housing: 5000, transport: 2500 });
    const total = r.categories.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("ignores negative and non-finite inputs", () => {
    // @ts-expect-error — intentionally passing bad input
    const r = compute({ food: -1000, housing: "oops", healthcare: 5000 });
    expect(r.total_spend).toBe(5000);
  });

  it("uses class-level indices for meat/poultry when available", () => {
    // Meat is category food_meat, points to foodClass 01.1.2.
    // If indices are present in snapshot, its inflation should match foodClassYoY("01.1.2").
    // If missing, it falls back to food_and_beverages.
    const r = compute({ food_meat: 10000 });
    const meat = r.categories.find((c) => c.key === "food_meat");
    expect(meat).toBeDefined();

    const classInfl = foodClassYoY("01.1.2");
    if (classInfl !== null) {
      expect(meat!.inflation).toBeCloseTo(classInfl, 6);
    } else {
      const foodInfl = subgroupYoY("food_and_beverages");
      expect(meat!.inflation).toBeCloseTo(foodInfl!, 6);
    }
  });
});

describe("gap decomposition", () => {
  it("sum of gap_contribution equals personal − weighted-avg official", () => {
    const spending = { food: 25000, housing: 15000, healthcare: 6000, education: 4000, transport: 5000 };
    const r = compute(spending);
    const sum = r.gap_decomposition.reduce((s, x) => s + x.gap_contribution, 0);
    const weightedAvgGap = r.personal_inflation - weightedAvgYoY();
    expect(sum).toBeCloseTo(weightedAvgGap, 3);
  });

  it("decomposeGap exposes weight diffs that sum to zero across categories", () => {
    const spending = { food: 10000, housing: 5000, transport: 3000 };
    const rows = decomposeGap(spending);
    const totalUser = rows.reduce((s, r) => s + r.your_weight, 0);
    expect(totalUser).toBeCloseTo(1, 6);
    const totalDiff = rows.reduce((s, r) => s + r.weight_diff, 0);
    const totalNational = rows.reduce((s, r) => s + r.national_weight, 0);
    expect(totalDiff).toBeCloseTo(1 - totalNational, 6);
  });
});

describe("computeMonthlySeries", () => {
  it("returns chronologically increasing months with personal+official numbers", () => {
    const series = computeMonthlySeries({ food: 10000, housing: 5000 }, 24);
    expect(series.length).toBeGreaterThan(0);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].month > series[i - 1].month).toBe(true);
    }
    for (const p of series) {
      // personal can be null when division-level data isn't available for that
      // month (pre-Jan 2025 under base 2024=100), but official must always
      // resolve since the series is anchored on general-index availability.
      expect(p.personal === null || Number.isFinite(p.personal)).toBe(true);
      expect(Number.isFinite(p.official)).toBe(true);
    }
    // At least one point should have a real personal reading.
    expect(series.some((p) => p.personal != null)).toBe(true);
  });
});
