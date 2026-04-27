import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { geminiApiKeys, withKeyFailover } from "@/lib/ai/gemini-keys";

const SECTOR_VALUES = ["combined", "urban", "rural"] as const;

const STATE_NAMES = [
  "All India",
  "Andaman And Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu And Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "NCT of Delhi",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "The Dadra And Nagar Haveli And Daman And Diu",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const responseSchema = z.object({
  // Division 01
  food: z.number().optional(),
  food_meat: z.number().optional(),
  food_seafood: z.number().optional(),
  // Division 02
  tobacco_alcohol: z.number().optional(),
  // Division 03
  clothing: z.number().optional(),
  // Division 04
  housing: z.number().optional(),
  // Division 05
  furnishings: z.number().optional(),
  // Division 06
  healthcare: z.number().optional(),
  // Division 07
  transport: z.number().optional(),
  // Division 08
  communication: z.number().optional(),
  // Division 09
  recreation: z.number().optional(),
  // Division 10
  education: z.number().optional(),
  // Division 11
  eating_out: z.number().optional(),
  // Division 12
  personal_care: z.number().optional(),
  state: z.enum(STATE_NAMES).optional(),
  sector: z.enum(SECTOR_VALUES).optional(),
  diet: z.enum(["veg", "non-veg"]).optional(),
});

function isUnavailable(err: unknown): boolean {
  const status = (err as any)?.status;
  const code = (err as any)?.code;
  const msg = String((err as any)?.message ?? "");
  return (
    status === "UNAVAILABLE" ||
    status === "RESOURCE_EXHAUSTED" ||
    code === 429 ||
    code === 503 ||
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("high demand") ||
    msg.includes("quota") ||
    msg.includes("rate limit")
  );
}

// Gemini sometimes embeds the error inside a successful 200 body. Detect that
// shape so we can throw and let withKeyFailover try the next key.
function bodyError(rawJson: unknown): { status?: string; code?: number; message?: string } | null {
  if (!rawJson || typeof rawJson !== "object" || !("error" in rawJson)) return null;
  const e = (rawJson as any).error;
  if (!e) return null;
  return { status: e.status, code: e.code, message: e.message };
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); }
    catch (err) {
      if (!isUnavailable(err) || i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

export async function POST(req: NextRequest) {
  try {
    if (geminiApiKeys().length === 0) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY_2 is not set in environment." },
        { status: 500 }
      );
    }

    const body = await req.json();
    if (!body.text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const prompt = `You are a financial parsing assistant for an Indian Personal Inflation Calculator.
Extract the monthly spending amounts (in INR) from the following text and map them to the appropriate categories.
Also infer location and area type when the user mentions them.
Return ONLY valid JSON matching the schema.

Spending categories (all amounts in INR per month):
- food: Groceries, vegetables, dairy, beverages cooked at home — for a
  vegetarian household this is the entire food bill; for a non-vegetarian
  household this is everything OTHER than meat and fish (cereals, dairy,
  vegetables, fruits, oils, etc.).
- food_meat: Chicken, mutton, beef, pork — fresh, chilled or frozen meat
  & poultry. Only emit when the user is non-vegetarian and gives an
  explicit amount or proportion for meat/poultry.
- food_seafood: Fish, prawns, crab, other seafood. Only emit when the
  user is non-vegetarian and mentions fish/seafood spend.
- eating_out: Restaurants, cafes, dhabas, food delivery, hotels (MoSPI div 11)
- housing: Rent (incl. imputed rent if owned), water, electricity, cooking gas (div 04)
- furnishings: Furniture, home appliances, cleaning products, domestic help (div 05)
- transport: Vehicle fuel (petrol/diesel), public transport, taxi, vehicle upkeep (div 07)
- communication: Mobile, broadband, internet, postal services (div 08)
- healthcare: Medicines, doctor fees, hospitals, insurance (div 06)
- education: School/college fees, books, tuitions (div 10)
- clothing: Apparel, footwear, tailoring (div 03)
- personal_care: Toiletries, grooming, haircuts, hygiene, personal-care services (div 12)
- recreation: OTT, movies, sports, hobbies, books, cultural events (div 09)
- tobacco_alcohol: Paan, cigarettes, bidi, tobacco, alcohol, intoxicants (div 02)

Location:
- state: Map any city or state mentioned to its Indian state/UT name. Use one of:
  ${STATE_NAMES.join(", ")}.
  Examples: "Bangalore" or "Bengaluru" → "Karnataka"; "Mumbai" or "Pune" → "Maharashtra";
  "Delhi" or "Gurgaon-side Delhi NCR" → "NCT of Delhi"; "Hyderabad" → "Telangana";
  "Chennai" → "Tamil Nadu"; "Ahmedabad" or "Surat" → "Gujarat".
  Omit if no location is mentioned.
- sector: REQUIRED to be one of exactly three values: "urban", "rural", or "combined"
  (combined = Urban + Rural blended). Pick the single best fit:
    • "urban"    → user clearly lives in a city/town/metro (e.g. "Mumbai", "Bangalore",
                   "I work in an office in Gurgaon").
    • "rural"    → user explicitly mentions a village, farm, or rural setting as
                   their primary residence.
    • "combined" → user mentions a state/UT without specifying urban-vs-rural, OR
                   their situation is genuinely mixed (e.g. "we split time between
                   our farm and our flat in the city"), OR no location signal at all.
  Always emit one of these three values — do NOT omit the field.

Diet:
- diet: "veg" or "non-veg". Set "non-veg" if the user mentions eating
  meat, chicken, mutton, beef, pork, fish, seafood, prawns, eggs, or
  describes themselves as non-vegetarian. Otherwise default to "veg".
  When diet is "non-veg" and the user gives a single combined "food"
  amount with no breakdown, you may make a sensible split: roughly 70%
  to food, 20% to food_meat, 10% to food_seafood for a typical
  Indian non-veg household — but only if the user clearly signals they
  eat both meat and fish. If they only mention meat OR fish, skip the
  other field.

Estimation when numbers are missing:
- The user is describing their lifestyle. They will often give qualitative cues
  (city, profession, family size, type of housing, vehicle, eating-out habits,
  hobbies, dependents, schooling, etc.) WITHOUT explicit rupee amounts.
- In that case, you MUST still produce a plausible monthly INR estimate for
  every category that fits their described lifestyle — do not leave the basket
  empty just because numbers are missing. Use Indian middle-class norms as a
  baseline and adjust up or down using every signal in the text:
    • Tier-1 metro (Mumbai/Bangalore/Delhi/Hyderabad/Pune/Chennai) → higher
      housing, transport, eating_out, recreation than a tier-2/3 town.
    • Family size: a couple with two kids spends more on food, education,
      healthcare, clothing than a single working professional.
    • Lifestyle markers: "luxury", "frugal", "student", "retired", "startup
      founder", "homemaker", "owns a car", "uses metro", "orders Swiggy daily",
      "cooks at home", "sends kids to private school" should all materially
      shift the relevant categories.
    • Owned home vs. renting: imputed rent is usually lower than market rent.
- Use the explicit numbers the user DOES give as anchors and scale the estimated
  categories around them so the total feels coherent (e.g. someone paying ₹80k
  rent in Mumbai is unlikely to spend only ₹2k on groceries).
- It is fine — and expected — to fabricate reasonable numbers for unmentioned
  categories. The goal is a complete, realistic monthly basket, not literal
  transcription. Do not output 0 for a category unless the user clearly said
  they spend nothing on it (e.g. "I don't drink or smoke" → tobacco_alcohol: 0).
- Only omit a category entirely if it genuinely does not apply (e.g.
  food_meat / food_seafood for a vegetarian, education for a single person
  with no dependents).

Only output the JSON object.

Text to parse:
"""
${body.text}
"""
`;

    const rawJson = await withKeyFailover(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await withRetry(() => ai.models.generateContent({
        model: "gemini-3.1-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      }));

      const text = response.text ?? "";
      if (!text) throw new Error("No response text from Gemini");

      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error("Invalid JSON from Gemini"); }

      // Gemini sometimes embeds the error inside a 200 body — surface as a
      // throw so withKeyFailover can try the next key.
      const be = bodyError(parsed);
      if (be) {
        const err: any = new Error(be.message || `Gemini body error: ${be.status ?? be.code}`);
        err.status = be.status;
        err.code = be.code;
        throw err;
      }
      return parsed;
    });

    const parsed = responseSchema.parse(rawJson);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("AI parse error:", error);
    const busy = isUnavailable(error);
    return NextResponse.json(
      { error: busy ? "AI service is busy — please try again in a moment." : (error.message || "Failed to parse text") },
      { status: busy ? 503 : 500 },
    );
  }
}
