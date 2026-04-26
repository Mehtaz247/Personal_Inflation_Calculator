export type MonthKey = `${number}-${string}`;

export interface CpiSubgroupMeta {
  label: string;
  weight: number;
}

export interface CpiSnapshot {
  series_id: string;
  description: string;
  source: string;
  source_url: string;
  base_year: number;
  as_of_month: MonthKey;
  frequency: "monthly";
  currency_unit: string;
  provenance_note: string;
  subgroups: Record<string, CpiSubgroupMeta>;
  indices: Record<string, Record<MonthKey, number>>;
}

export type SubgroupKey =
  | "food_and_beverages"
  | "pan_tobacco_and_intoxicants"
  | "clothing_and_footwear"
  | "housing"
  | "fuel_and_light"
  | "household_goods_and_services"
  | "health"
  | "transport_and_communication"
  | "recreation_and_amusement"
  | "education"
  | "personal_care_and_effects";
