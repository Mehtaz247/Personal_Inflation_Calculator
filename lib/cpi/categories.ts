import type { SubgroupKey } from "./types";
import { SUBGROUP_SPECS } from "./transform";

export type UserCategoryKey =
  | "food"
  | "food_meat"
  | "food_seafood"
  | "eating_out"
  | "housing"
  | "transport"
  | "communication"
  | "healthcare"
  | "education"
  | "clothing"
  | "household_personal"
  | "entertainment"
  | "tobacco_alcohol";

export interface UserCategory {
  key: UserCategoryKey;
  label: string;
  description: string;
  subgroups: Array<{ subgroup: SubgroupKey; split: number }>;
  /**
   * Optional COICOP class code (e.g. "01.1.2") that overrides the
   * subgroup-level mapping with class-level food data when available.
   * If the class indices aren't in the snapshot (or for state-level
   * fetches that don't include class rows), the engine falls back to
   * the parent `subgroups` mapping.
   */
  foodClass?: string;
  /**
   * Categories tagged "non-veg" are only relevant when the user has
   * indicated a non-vegetarian diet. The Calculator UI hides them by
   * default and exposes them under a Veg/Non-veg toggle.
   */
  dietary?: "non-veg";
}

const W = Object.fromEntries(SUBGROUP_SPECS.map((s) => [s.key, s.weight])) as Record<SubgroupKey, number>;

function normalizeSplit(parts: Array<{ subgroup: SubgroupKey; split: number }>) {
  const total = parts.reduce((s, p) => s + p.split, 0);
  return parts.map((p) => ({ subgroup: p.subgroup, split: p.split / total }));
}

export const USER_CATEGORIES: UserCategory[] = [
  {
    key: "food",
    label: "Veg food & groceries",
    description: "Cereals, vegetables, dairy, fruits, oils, beverages cooked at home",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
  },
  {
    key: "food_meat",
    label: "Meat & poultry",
    description: "Chicken, mutton, beef, pork — fresh, chilled or frozen (MoSPI groups all meat together at this level)",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
    foodClass: "01.1.2",
    dietary: "non-veg",
  },
  {
    key: "food_seafood",
    label: "Fish & seafood",
    description: "Fish, prawns, crab — fresh, chilled or frozen",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
    foodClass: "01.1.3",
    dietary: "non-veg",
  },
  {
    key: "eating_out",
    label: "Restaurants & takeout",
    description: "Restaurants, cafes, hotels, food delivery, accommodation",
    subgroups: [{ subgroup: "restaurants_accommodation", split: 1 }],
  },
  {
    key: "housing",
    label: "Housing & utilities",
    description: "Rent (incl. imputed rent if you own), water, electricity, cooking gas — do not include vehicle fuel",
    subgroups: [{ subgroup: "housing_utilities", split: 1 }],
  },
  {
    key: "transport",
    label: "Transport",
    description: "Vehicle fuel (petrol/diesel), public transport, taxi, vehicle upkeep",
    subgroups: [{ subgroup: "transport", split: 1 }],
  },
  {
    key: "communication",
    label: "Phone & internet",
    description: "Mobile, broadband, postal — information & communication services",
    subgroups: [{ subgroup: "information_communication", split: 1 }],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    description: "Medicines, doctor fees, hospitals, insurance premiums",
    subgroups: [{ subgroup: "health", split: 1 }],
  },
  {
    key: "education",
    label: "Education",
    description: "School / college fees, books, tuitions",
    subgroups: [{ subgroup: "education_services", split: 1 }],
  },
  {
    key: "clothing",
    label: "Clothing & footwear",
    description: "Apparel, footwear, tailoring",
    subgroups: [{ subgroup: "clothing_and_footwear", split: 1 }],
  },
  {
    key: "household_personal",
    label: "Household & personal care",
    description: "Furnishings, household goods, toiletries, grooming, personal-care services",
    subgroups: normalizeSplit([
      { subgroup: "furnishings_household", split: W.furnishings_household },
      { subgroup: "personal_care_misc", split: W.personal_care_misc },
    ]),
  },
  {
    key: "entertainment",
    label: "Entertainment & recreation",
    description: "Movies, OTT, sports, hobbies, books, cultural events",
    subgroups: [{ subgroup: "recreation_culture", split: 1 }],
  },
  {
    key: "tobacco_alcohol",
    label: "Tobacco / alcohol",
    description: "Paan, tobacco, intoxicants",
    subgroups: [{ subgroup: "pan_tobacco_and_intoxicants", split: 1 }],
  },
];

export function findCategory(key: UserCategoryKey): UserCategory {
  const c = USER_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown user category: ${key}`);
  return c;
}
