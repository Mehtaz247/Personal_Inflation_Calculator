import { NextResponse } from "next/server";
import { compute, type SpendingInput } from "@/lib/inflation/engine";
import { generateExplanation } from "@/lib/ai/explain";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const spending = (body as { spending?: SpendingInput })?.spending ?? {};
  const result = compute(spending);

  try {
    const { text, source } = await generateExplanation(result);
    return NextResponse.json({ text, source, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "AI explanation failed", detail: message, result },
      { status: 502 },
    );
  }
}
