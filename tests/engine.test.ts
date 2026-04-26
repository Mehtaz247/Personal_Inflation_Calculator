import { describe, it, expect } from "vitest";
import { compute } from "@/lib/inflation/engine";
import { headlineYoY, subgroupYoY, getLatestMonth } from "@/lib/cpi/snapshot";

describe("CPI snapshot", () => {
  it("exposes a latest month", () => {
    expect(getLatestMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it("computes subgroup YoY from index ratios", () => {
    // With our 2024=100 construction, each subgroup's YoY should equal its
    // configured rate (food = 5.5%).
    const food = subgroupYoY("food_and_beverages");
    expect(food).not.toBeNull();
    expect(food!).toBeCloseTo(0.055, 3);
  });

  it("headline YoY is a weighted combination of subgroup YoY", () => {
    const h = headlineYoY();
    // Should be within the range of subgroup YoY rates.
    expect(h).toBeGreaterThan(0.02);
    expect(h).toBeLessThan(0.07);
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
    expect(r.personal_inflation).toBeCloseTo(0.055, 3);
    expect(r.categories.find((c) => c.key === "food")!.weight).toBe(1);
  });

  it("a housing-only household has personal inflation equal to housing YoY", () => {
    const r = compute({ housing: 20000 });
    expect(r.personal_inflation).toBeCloseTo(0.035, 3);
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
    expect(r.personal_inflation).toBeCloseTo(0.06, 3);
  });
});
