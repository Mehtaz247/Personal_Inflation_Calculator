import { NextResponse } from "next/server";
import { compute, type SpendingInput } from "@/lib/inflation/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const spending = (body as { spending?: SpendingInput })?.spending ?? {};
  if (typeof spending !== "object" || spending === null) {
    return NextResponse.json({ error: "`spending` must be an object" }, { status: 400 });
  }

  const result = compute(spending);
  return NextResponse.json(result);
}
