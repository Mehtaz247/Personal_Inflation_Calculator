import type { SubgroupKey } from "./types";

export type UserCategoryKey =
  | "food"
  | "food_meat"
  | "food_seafood"
  | "tobacco_alcohol"
  | "clothing"
  | "housing"
  | "furnishings"
  | "healthcare"
  | "transport"
  | "communication"
  | "recreation"
  | "education"
  | "eating_out"
  | "personal_care";

export interface UserCategory {
  key: UserCategoryKey;
  label: string;
  /** MoSPI COICOP 2018 division name this maps to */
  mospidivision: string;
  description: string;
  subgroups: Array<{ subgroup: SubgroupKey; split: number }>;
  /**
   * Optional COICOP class code (e.g. "01.1.2") — overrides division-level
   * data with class-level food indices when available. Falls back to the
   * parent subgroup if class data is missing (e.g. in state mode).
   */
  foodClass?: string;
  /** Categories tagged "non-veg" are hidden unless the user selects Non-veg diet. */
  dietary?: "non-veg";
}

export const USER_CATEGORIES: UserCategory[] = [
  // ── Division 01 ────────────────────────────────────────────────────────
  {
    key: "food",
    label: "Food and beverages",
    mospidivision: "Food and beverages",
    description: "Groceries, cereals, dairy, oils, fruits, vegetables, beverages prepared at home",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
  },
  {
    key: "food_meat",
    label: "Meat & poultry",
    mospidivision: "Food and beverages",
    description: "Chicken, mutton, beef, pork — fresh, chilled or frozen (MoSPI codes all meat under 01.1.2)",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
    foodClass: "01.1.2",
    dietary: "non-veg",
  },
  {
    key: "food_seafood",
    label: "Fish & seafood",
    mospidivision: "Food and beverages",
    description: "Fish, prawns, crab and other seafood (COICOP class 01.1.3)",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
    foodClass: "01.1.3",
    dietary: "non-veg",
  },
  // ── Division 02 ────────────────────────────────────────────────────────
  {
    key: "tobacco_alcohol",
    label: "Paan, tobacco and intoxicants",
    mospidivision: "Paan, tobacco and intoxicants",
    description: "Paan, cigarettes, bidi, smokeless tobacco, alcohol, intoxicants",
    subgroups: [{ subgroup: "pan_tobacco_and_intoxicants", split: 1 }],
  },
  // ── Division 03 ────────────────────────────────────────────────────────
  {
    key: "clothing",
    label: "Clothing and footwear",
    mospidivision: "Clothing and footwear",
    description: "Apparel, footwear, tailoring and repair services",
    subgroups: [{ subgroup: "clothing_and_footwear", split: 1 }],
  },
  // ── Division 04 ────────────────────────────────────────────────────────
  {
    key: "housing",
    label: "Housing, water, electricity, gas",
    mospidivision: "Housing, water, electricity, gas and other fuels",
    description: "Rent (incl. imputed rent if you own), water supply, electricity, cooking gas & other fuels — exclude vehicle fuel",
    subgroups: [{ subgroup: "housing_utilities", split: 1 }],
  },
  // ── Division 05 ────────────────────────────────────────────────────────
  {
    key: "furnishings",
    label: "Furniture, household equipment and maintenance",
    mospidivision: "Furnishings, household equipment and routine household maintenance",
    description: "Furniture, home appliances, cleaning products, domestic services",
    subgroups: [{ subgroup: "furnishings_household", split: 1 }],
  },
  // ── Division 06 ────────────────────────────────────────────────────────
  {
    key: "healthcare",
    label: "Health",
    mospidivision: "Health",
    description: "Medicines, doctor consultations, hospitals, health insurance premiums",
    subgroups: [{ subgroup: "health", split: 1 }],
  },
  // ── Division 07 ────────────────────────────────────────────────────────
  {
    key: "transport",
    label: "Transport",
    mospidivision: "Transport",
    description: "Vehicle fuel (petrol/diesel), public transport, auto/taxi, vehicle upkeep & purchase",
    subgroups: [{ subgroup: "transport", split: 1 }],
  },
  // ── Division 08 ────────────────────────────────────────────────────────
  {
    key: "communication",
    label: "Information and communication",
    mospidivision: "Information and communication",
    description: "Mobile, broadband, internet, postal services, devices",
    subgroups: [{ subgroup: "information_communication", split: 1 }],
  },
  // ── Division 09 ────────────────────────────────────────────────────────
  {
    key: "recreation",
    label: "Recreation, sport and culture",
    mospidivision: "Recreation, sport and culture",
    description: "OTT, movies, sports, hobbies, newspapers, books, cultural events",
    subgroups: [{ subgroup: "recreation_culture", split: 1 }],
  },
  // ── Division 10 ────────────────────────────────────────────────────────
  {
    key: "education",
    label: "Education services",
    mospidivision: "Education services",
    description: "School / college fees, tuitions, books & stationery",
    subgroups: [{ subgroup: "education_services", split: 1 }],
  },
  // ── Division 11 ────────────────────────────────────────────────────────
  {
    key: "eating_out",
    label: "Restaurants and accommodation",
    mospidivision: "Restaurants and accommodation services",
    description: "Restaurants, cafes, dhabas, food delivery, hotels, guest houses",
    subgroups: [{ subgroup: "restaurants_accommodation", split: 1 }],
  },
  // ── Division 12 ────────────────────────────────────────────────────────
  {
    key: "personal_care",
    label: "Personal care and miscellaneous services",
    mospidivision: "Personal care, social protection and miscellaneous goods and services",
    description: "Toiletries, grooming, haircuts, personal hygiene, social protection, miscellaneous",
    subgroups: [{ subgroup: "personal_care_misc", split: 1 }],
  },
];

export function findCategory(key: UserCategoryKey): UserCategory {
  const c = USER_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown user category: ${key}`);
  return c;
}
