import { NextResponse } from "next/server";
import { compute, computeMonthlySeries, type SpendingInput } from "@/lib/inflation/engine";
import { computeForState } from "@/lib/inflation/state-engine";
import type { Sector } from "@/lib/cpi/types";

export const runtime = "nodejs";

const SECTORS: Sector[] = ["combined", "urban", "rural"];

const STATE_CODES: Record<string, number> = {
  "All India": 1,
  "Andaman And Nicobar Islands": 2,
  "Andhra Pradesh": 3,
  "Arunachal Pradesh": 4,
  "Assam": 5,
  "Bihar": 6,
  "Chandigarh": 7,
  "Chhattisgarh": 8,
  "Goa": 9,
  "Gujarat": 10,
  "Haryana": 11,
  "Himachal Pradesh": 12,
  "Jammu And Kashmir": 13,
  "Jharkhand": 14,
  "Karnataka": 15,
  "Kerala": 16,
  "Ladakh": 17,
  "Lakshadweep": 18,
  "Madhya Pradesh": 19,
  "Maharashtra": 20,
  "Manipur": 21,
  "Meghalaya": 22,
  "Mizoram": 23,
  "Nagaland": 24,
  "NCT of Delhi": 25,
  "Odisha": 26,
  "Puducherry": 27,
  "Punjab": 28,
  "Rajasthan": 29,
  "Sikkim": 30,
  "Tamil Nadu": 31,
  "Telangana": 32,
  "The Dadra And Nagar Haveli And Daman And Diu": 33,
  "Tripura": 34,
  "Uttar Pradesh": 35,
  "Uttarakhand": 36,
  "West Bengal": 37,
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b = (body ?? {}) as { spending?: SpendingInput; sector?: string; state?: string };
  const spending = b.spending ?? {};
  if (typeof spending !== "object" || spending === null) {
    return NextResponse.json({ error: "`spending` must be an object" }, { status: 400 });
  }
  const sector: Sector = (SECTORS as string[]).includes(b.sector ?? "")
    ? (b.sector as Sector)
    : "combined";

  const stateName = b.state ?? "All India";
  const stateCode = STATE_CODES[stateName];

  if (stateName !== "All India" && stateCode && stateCode !== 1) {
    try {
      const result = await computeForState(spending, stateCode, sector);
      return NextResponse.json({ ...result, state: stateName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "State data fetch failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  const result = compute(spending, undefined, sector);
  const series = computeMonthlySeries(spending, 24, sector);
  return NextResponse.json({ ...result, monthly_series: series, state: "All India" });
}
