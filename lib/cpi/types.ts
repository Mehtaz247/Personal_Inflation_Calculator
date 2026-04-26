export type MonthKey = `${number}-${string}`;

export type Sector = "combined" | "urban" | "rural";

export interface CpiSubgroupMeta {
  label: string;
  weight: number;
  code?: string;
}

export interface CpiSectorData {
  subgroups: Record<string, CpiSubgroupMeta>;
  indices: Record<string, Record<MonthKey, number>>;
  general_index?: Record<MonthKey, number>;
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
  official_headline?: Partial<Record<Sector, number>>;
  sectors: Record<Sector, CpiSectorData>;
}

export type SubgroupKey =
  | "food_and_beverages"
  | "pan_tobacco_and_intoxicants"
  | "clothing_and_footwear"
  | "housing_utilities"
  | "furnishings_household"
  | "health"
  | "transport"
  | "information_communication"
  | "recreation_culture"
  | "education_services"
  | "restaurants_accommodation"
  | "personal_care_misc";
