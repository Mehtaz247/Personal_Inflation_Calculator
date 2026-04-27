import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy",
});

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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not set in environment." },
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

If a spending category is not mentioned, omit it or set it to 0. Only output the JSON object.

Text to parse:
"""
${body.text}
"""
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text ?? "";
    if (!text) {
      throw new Error("No response text from Gemini");
    }

    const parsed = responseSchema.parse(JSON.parse(text));
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("AI parse error:", error);
    return NextResponse.json({ error: error.message || "Failed to parse text" }, { status: 500 });
  }
}
