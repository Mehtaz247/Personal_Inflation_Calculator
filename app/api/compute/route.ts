import { NextResponse } from "next/server";
import { computeForState } from "@/lib/inflation/state-engine";
import { compute, computeMonthlySeries, type SpendingInput } from "@/lib/inflation/engine";
import type { Sector } from "@/lib/cpi/types";

export const runtime = "nodejs";
export const maxDuration = 15; // state fetch can be slow (2 API calls)

const SECTORS: Sector[] = ["combined", "urban", "rural"];

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as { spending?: SpendingInput; sector?: string; state_code?: number };
  const spending = b.spending ?? {};
  const sector: Sector = (SECTORS as string[]).includes(b.sector ?? "")
    ? (b.sector as Sector)
    : "combined";

  // All India → use local computation
  if (b.state_code == null || b.state_code === 0) {
    const result = compute(spending, undefined, sector);
    const series = computeMonthlySeries(spending, 24, sector);
    return NextResponse.json({ ...result, monthly_series: series });
  }

  // State-level → call MoSPI API. On failure we still return All-India
  // numbers so the user gets *something*, but we tag the response with
  // `state_error` so the UI can show an explicit notification rather than
  // silently mislabelling the data.
  try {
    const result = await computeForState(spending, b.state_code, sector);
    const series = computeMonthlySeries(spending, 24, sector);
    return NextResponse.json({ ...result, monthly_series: series });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const fallback = compute(spending, undefined, sector);
    const series = computeMonthlySeries(spending, 24, sector);
    return NextResponse.json({
      ...fallback,
      monthly_series: series,
      state_error: `Could not fetch ${sector} CPI for state ${b.state_code} from MoSPI: ${message}. Showing All India data as a fallback.`,
      requested_state_code: b.state_code,
    });
  }
}
