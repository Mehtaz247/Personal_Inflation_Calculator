import type { SubgroupKey } from "./types";
import { SUBGROUP_SPECS } from "./transform";

export type UserCategoryKey =
  | "food"
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
}

const W = Object.fromEntries(SUBGROUP_SPECS.map((s) => [s.key, s.weight])) as Record<SubgroupKey, number>;

function normalizeSplit(parts: Array<{ subgroup: SubgroupKey; split: number }>) {
  const total = parts.reduce((s, p) => s + p.split, 0);
  return parts.map((p) => ({ subgroup: p.subgroup, split: p.split / total }));
}

export const USER_CATEGORIES: UserCategory[] = [
  {
    key: "food",
    label: "Food & groceries",
    description: "Groceries, vegetables, dairy, beverages cooked at home",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
  },
  {
    key: "eating_out",
    label: "Restaurants & takeout",
    description: "Restaurants, cafes, hoteilers, food delivery, accommodation",
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
