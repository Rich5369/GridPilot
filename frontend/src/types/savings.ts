// Frozen v1 backend/savings/models.py + backend/ai/savings.py contracts.
export const savingsCategories = [
  "benchmark",
  "tariff_comparison",
  "led",
  "lighting_controls",
  "shutdown",
  "hvac_setpoints",
  "hvac_schedule",
  "hvac_maintenance",
  "solar",
  "envelope",
  "demand",
  "refrigeration",
  "compressed_air",
  "motor",
  "office",
  "scheduling",
] as const;
export type SavingsCategory = (typeof savingsCategories)[number];
export const evidenceKinds = [
  "user_entered",
  "measured",
  "synthetic",
  "engineering_assumption",
] as const;
export type EvidenceKind = (typeof evidenceKinds)[number];
export interface SavingsProfile {
  business_type?: string | null;
  employee_count?: number | null;
  operating_hours?: string | null;
  electricity_cost_and_period?: string | null;
  consumption_and_units?: string | null;
  equipment?: string | null;
  goals?: string | null;
  restrictions?: string | null;
}
export interface SavingsLocation {
  state?: string | null;
  zip_code?: string | null;
  city?: string | null;
  utility?: string | null;
  rate_plan?: string | null;
}
export interface SavingsRate {
  usd_per_kwh: number;
  source: string;
  valid_from: string;
  valid_through: string;
  customer_applicability_confirmed: boolean;
  flat_avoidable_energy_rate_confirmed: boolean;
}
export const measureNumbers = [
  "installation_cost_usd",
  "annual_incremental_cost_usd",
  "annual_operating_cost_savings_usd",
  "fixture_count",
  "old_watts",
  "new_watts",
  "hours_per_day",
  "days_per_year",
  "connected_load_kw",
  "existing_hours_per_day",
  "avoidable_hours_per_day",
  "device_count",
  "active_watts",
  "low_power_watts",
  "before_annual_kwh",
  "after_annual_kwh",
] as const;
export const measureBooleans = [
  "applicable",
  "safe_to_switch_off",
  "essential_service",
  "equivalent_service_confirmed",
  "operating_baseline_confirmed",
  "comparison_conditions_confirmed",
] as const;
export type MeasureNumber = (typeof measureNumbers)[number];
export type MeasureBoolean = (typeof measureBooleans)[number];
export type SavingsMeasure = {
  id: string;
  category: SavingsCategory;
  load_id: string;
  evidence_kind: EvidenceKind;
  evidence_reference: string;
  operating_cost_savings_reference?: string | null;
  rate?: SavingsRate | null;
} & Partial<Record<MeasureNumber, number | null>> &
  Partial<Record<MeasureBoolean, boolean | null>>;
export interface SavingsRequest {
  profile?: SavingsProfile;
  location?: SavingsLocation;
  measures?: SavingsMeasure[];
}
export interface SavingsConversationRequest {
  request: string;
  history?: { role: "user" | "assistant"; content: string }[];
  evidence: SavingsRequest;
  category_applicability?: Partial<Record<SavingsCategory, boolean>>;
}
export interface SavingsCategoryDescriptor {
  category: SavingsCategory;
  title: string;
  eligibility: string;
  business_types: string[];
  required_inputs: string[];
  optional_inputs: string[];
  calculation_method: string;
  sources: string[];
  data_quality_requirements: string;
  implementation_complexity: "low" | "medium" | "high";
  numerical_savings_supported: boolean;
}
export interface SavingsCatalog {
  version: "1";
  categories: SavingsCategoryDescriptor[];
}
export const recommendationNumbers = [
  "annual_kwh_saved",
  "annual_energy_charge_savings_usd",
  "annual_net_savings_usd",
  "upfront_cost_usd",
  "simple_payback_years",
  "annual_simple_roi_percent",
] as const;
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SavingsRecommendation = {
  id: string;
  category: SavingsCategory;
  title: string;
  explanation: string;
  applicability: "confirmed" | "possible" | "not_applicable";
  calculation_status:
    "quantified" | "scenario_estimate" | "needs_data" | "not_applicable";
  // Optional for compatibility with v1 deployments predating PR #53.
  annual_operating_cost_savings_usd?: number | null;
  // Additive advisory evidence limitations; absent on older v1 responses.
  warnings?: string[];
  confidence: string;
  provenance: Record<string, JsonValue>;
  inputs_used: Record<string, JsonValue>;
  assumptions: string[];
  calculation_method: string;
  missing_information: string[];
  sources: string[];
  next_action: string;
  priority_group:
    "financial" | "energy_only" | "investigation" | "not_applicable";
  priority_reason: string;
} & Record<(typeof recommendationNumbers)[number], number | null>;
export interface SavingsBenchmark {
  state: string;
  sector: "COM";
  currency: "USD";
  unit: "USD/kWh";
  average_retail_price: number | null;
  period: string;
  source: string;
  source_url: string;
  retrieved_at: string;
  released_at: string;
  freshness: "available" | "saved" | "delayed";
  provenance: "historical_public_data";
  notice: string;
}
export interface SavingsResponse {
  version: "1";
  benchmark: SavingsBenchmark | null;
  location_notice: string;
  recommendations: SavingsRecommendation[];
  portfolio_savings_usd: null;
  warnings: string[];
}
export interface SavingsConversationResponse {
  source: "meta" | "deterministic_fallback";
  message: string;
  selected_categories: SavingsCategory[];
  facts: string[];
  follow_up_questions: string[];
  savings: SavingsResponse;
}

// Browser-local input drafts only. Responses, result IDs and conversations are not saved.
export type Confirmation = "" | "yes" | "no";
export interface SavingsMeasureDraft {
  id: string;
  category: SavingsCategory;
  load_id: string;
  evidence_kind: EvidenceKind;
  evidence_reference: string;
  operating_cost_savings_reference: string;
  numbers: Record<MeasureNumber, string>;
  confirmations: Record<MeasureBoolean, Confirmation>;
  rateEnabled: boolean;
  rate: {
    usd_per_kwh: string;
    source: string;
    valid_from: string;
    valid_through: string;
    customer_applicability_confirmed: Confirmation;
    flat_avoidable_energy_rate_confirmed: Confirmation;
  };
}
export interface SavingsDraft {
  location: Record<keyof SavingsLocation, string>;
  measures: SavingsMeasureDraft[];
  applicability: Partial<Record<SavingsCategory, Confirmation>>;
  question: string;
}
