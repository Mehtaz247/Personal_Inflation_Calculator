import type { SubgroupKey } from "./types";

/**
 * User-facing buckets → official CPI subgroups.
 *
 * Every mapping assumption for this app lives in this file. If MoSPI adds or
 * renames subgroups, changing this table and the snapshot JSON is enough.
 *
 * A user bucket maps to one or more subgroups. When a bucket spans multiple
 * subgroups, the user's rupee spending is split across them in proportion to
 * the supplied split weights (which must sum to 1). Split weights default to
 * official subgroup weights when not supplied.
 */
export type UserCategoryKey =
  | "food"
  | "housing"
  | "fuel_utilities"
  | "transport"
  | "healthcare"
  | "education"
  | "clothing"
  | "household_personal"
  | "miscellaneous";

export interface UserCategory {
  key: UserCategoryKey;
  label: string;
  description: string;
  subgroups: Array<{ subgroup: SubgroupKey; split: number }>;
}

export const USER_CATEGORIES: UserCategory[] = [
  {
    key: "food",
    label: "Food & groceries",
    description: "Groceries, vegetables, dairy, eating out, beverages",
    subgroups: [{ subgroup: "food_and_beverages", split: 1 }],
  },
  {
    key: "housing",
    label: "Housing / rent",
    description: "Rent or imputed housing cost",
    subgroups: [{ subgroup: "housing", split: 1 }],
  },
  {
    key: "fuel_utilities",
    label: "Fuel & utilities",
    description: "Electricity, cooking gas, water",
    subgroups: [{ subgroup: "fuel_and_light", split: 1 }],
  },
  {
    key: "transport",
    label: "Transport & communication",
    description: "Fuel for vehicles, public transport, phone, internet",
    subgroups: [{ subgroup: "transport_and_communication", split: 1 }],
  },
  {
    key: "healthcare",
    label: "Healthcare",
    description: "Medicines, doctor fees, insurance premiums",
    subgroups: [{ subgroup: "health", split: 1 }],
  },
  {
    key: "education",
    label: "Education",
    description: "School / college fees, books, tuitions",
    subgroups: [{ subgroup: "education", split: 1 }],
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
    description: "Household goods, toiletries, grooming",
    subgroups: [
      // Split roughly in the ratio of official subgroup weights.
      { subgroup: "household_goods_and_services", split: 0.5 },
      { subgroup: "personal_care_and_effects", split: 0.5 },
    ],
  },
  {
    key: "miscellaneous",
    label: "Miscellaneous",
    description: "Recreation, tobacco, other discretionary",
    subgroups: [
      { subgroup: "recreation_and_amusement", split: 0.5 },
      { subgroup: "pan_tobacco_and_intoxicants", split: 0.5 },
    ],
  },
];

export function findCategory(key: UserCategoryKey): UserCategory {
  const c = USER_CATEGORIES.find((x) => x.key === key);
  if (!c) throw new Error(`Unknown user category: ${key}`);
  return c;
}
