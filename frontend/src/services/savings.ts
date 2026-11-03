import { apiRequest, ApiError, BACKEND_CONNECT_TIMEOUT_MS } from "./api";
import {
  savingsCategories,
  evidenceKinds,
  measureNumbers,
  measureBooleans,
  recommendationNumbers,
} from "../types/savings";
import type {
  SavingsCatalog,
  SavingsResponse,
  SavingsConversationResponse,
  SavingsRequest,
  SavingsConversationRequest,
  SavingsRecommendation,
  SavingsMeasure,
  JsonValue,
} from "../types/savings";
import {
  validDate,
  profileLimits,
  locationLimits,
  calculationFields,
  isCalculatedCategory,
} from "../data/savingsDraft";
import states from "../data/usStates.json";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(string);
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const nullableNumber = (v: unknown) => v === null || finite(v);
const enumValue = (v: unknown, values: readonly string[]) =>
  string(v) && values.includes(v);
const category = (v: unknown) => enumValue(v, savingsCategories);
const knownKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const url = (v: unknown) => {
  try {
    return string(v) && ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
};
const json = (v: unknown): v is JsonValue =>
  v === null ||
  string(v) ||
  typeof v === "boolean" ||
  finite(v) ||
  (Array.isArray(v) && v.every(json)) ||
  (object(v) && Object.values(v).every(json));
const nullableText = (v: unknown, max: number) =>
  v === null || (string(v) && v.length <= max);
function validMeasure(v: unknown): v is SavingsMeasure {
  if (
    !object(v) ||
    !knownKeys(v, [
      "id",
      "category",
      "load_id",
      "evidence_kind",
      "evidence_reference",
      "operating_cost_savings_reference",
      "rate",
      ...measureNumbers,
      ...measureBooleans,
    ]) ||
    !string(v.id) ||
    !v.id.trim() ||
    v.id.length > 100 ||
    !category(v.category) ||
    !string(v.load_id) ||
    !v.load_id.trim() ||
    v.load_id.length > 100 ||
    !enumValue(v.evidence_kind, evidenceKinds) ||
    !string(v.evidence_reference) ||
    !v.evidence_reference.trim() ||
    v.evidence_reference.length > 500
  )
    return false;
  if (
    v.operating_cost_savings_reference != null &&
    (!string(v.operating_cost_savings_reference) ||
      !v.operating_cost_savings_reference.trim() ||
      v.operating_cost_savings_reference.length > 500)
  )
    return false;
  if (
    finite(v.annual_operating_cost_savings_usd) &&
    v.annual_operating_cost_savings_usd > 0 &&
    !v.operating_cost_savings_reference
  )
    return false;
  for (const k of measureNumbers) {
    const n = v[k];
    if (n == null) continue;
    const max = [
      "hours_per_day",
      "existing_hours_per_day",
      "avoidable_hours_per_day",
    ].includes(k)
      ? 24
      : k === "days_per_year"
        ? 366
        : ["fixture_count", "device_count"].includes(k)
          ? 1e7
          : 1e12;
    if (
      !finite(n) ||
      n < 0 ||
      n > max ||
      (["fixture_count", "device_count", "days_per_year"].includes(k) &&
        (!Number.isInteger(n) || n < 1))
    )
      return false;
  }
  if (!measureBooleans.every((k) => v[k] == null || typeof v[k] === "boolean"))
    return false;
  if (v.rate != null) {
    const r = v.rate;
    if (
      !object(r) ||
      !knownKeys(r, [
        "usd_per_kwh",
        "source",
        "valid_from",
        "valid_through",
        "customer_applicability_confirmed",
        "flat_avoidable_energy_rate_confirmed",
      ]) ||
      !finite(r.usd_per_kwh) ||
      r.usd_per_kwh < 0 ||
      r.usd_per_kwh > 100 ||
      !string(r.source) ||
      !r.source.trim() ||
      r.source.length > 500 ||
      !string(r.valid_from) ||
      !string(r.valid_through) ||
      !validDate(r.valid_from) ||
      !validDate(r.valid_through) ||
      r.valid_through < r.valid_from ||
      typeof r.customer_applicability_confirmed !== "boolean" ||
      typeof r.flat_avoidable_energy_rate_confirmed !== "boolean"
    )
      return false;
  }
  for (const [a, b] of [
    ["old_watts", "new_watts"],
    ["active_watts", "low_power_watts"],
  ] as const)
    if (
      v[a] != null &&
      v[b] != null &&
      (Number(v[a]) <= 0 || Number(v[b]) > Number(v[a]))
    )
      return false;
  return (
    !(
      v.category === "led" &&
      v.new_watts != null &&
      Number(v.new_watts) <= 0
    ) &&
    !(
      v.existing_hours_per_day != null &&
      v.avoidable_hours_per_day != null &&
      Number(v.avoidable_hours_per_day) > Number(v.existing_hours_per_day)
    )
  );
}
export function isSavingsRequest(v: unknown): v is SavingsRequest {
  if (!object(v) || !knownKeys(v, ["profile", "location", "measures"]))
    return false;
  if (v.profile !== undefined) {
    if (!object(v.profile) || !knownKeys(v.profile, Object.keys(profileLimits)))
      return false;
    for (const [k, max] of Object.entries(profileLimits)) {
      const p = v.profile[k];
      if (p == null) continue;
      if (
        k === "employee_count"
          ? !finite(p) || !Number.isInteger(p) || p < 0 || p > max
          : !nullableText(p, max)
      )
        return false;
    }
  }
  if (v.location !== undefined) {
    if (
      !object(v.location) ||
      !knownKeys(v.location, Object.keys(locationLimits))
    )
      return false;
    for (const [k, max] of Object.entries(locationLimits)) {
      const l = v.location[k];
      if (l == null) continue;
      if (!string(l) || !l.trim() || l.length > max) return false;
      if (
        (k === "state" && !states.some((s) => s.name === l)) ||
        (k === "zip_code" && !/^\d{5}(-\d{4})?$/.test(l))
      )
        return false;
    }
  }
  return (
    v.measures === undefined ||
    (Array.isArray(v.measures) &&
      v.measures.length <= 100 &&
      v.measures.every(validMeasure) &&
      new Set(v.measures.map((m) => m.id)).size === v.measures.length)
  );
}
export function isSavingsCatalog(v: unknown): v is SavingsCatalog {
  if (
    !object(v) ||
    v.version !== "1" ||
    !Array.isArray(v.categories) ||
    v.categories.length !== savingsCategories.length
  )
    return false;
  const seen = new Set<unknown>();
  return v.categories.every((c) => {
    if (
      !object(c) ||
      !category(c.category) ||
      seen.has(c.category) ||
      ![
        "title",
        "eligibility",
        "calculation_method",
        "data_quality_requirements",
      ].every((k) => string(c[k])) ||
      ![
        "business_types",
        "required_inputs",
        "optional_inputs",
        "sources",
      ].every((k) => strings(c[k])) ||
      !(c.sources as string[]).every(url) ||
      !enumValue(c.implementation_complexity, ["low", "medium", "high"]) ||
      typeof c.numerical_savings_supported !== "boolean"
    )
      return false;
    seen.add(c.category);
    return true;
  });
}
function validRecommendation(v: unknown): v is SavingsRecommendation {
  if (
    !object(v) ||
    !string(v.id) ||
    !v.id ||
    !category(v.category) ||
    ![
      "title",
      "explanation",
      "confidence",
      "calculation_method",
      "next_action",
      "priority_reason",
    ].every((k) => string(v[k])) ||
    !["assumptions", "missing_information", "sources"].every((k) =>
      strings(v[k]),
    ) ||
    !(v.sources as string[]).every(url) ||
    !enumValue(v.applicability, ["confirmed", "possible", "not_applicable"]) ||
    !enumValue(v.calculation_status, [
      "quantified",
      "scenario_estimate",
      "needs_data",
      "not_applicable",
    ]) ||
    !enumValue(v.priority_group, [
      "financial",
      "energy_only",
      "investigation",
      "not_applicable",
    ]) ||
    (v.warnings !== undefined && !strings(v.warnings)) ||
    !recommendationNumbers.every((k) => nullableNumber(v[k])) ||
    !object(v.provenance) ||
    !json(v.provenance) ||
    !object(v.inputs_used) ||
    !json(v.inputs_used)
  )
    return false;
  if (
    v.annual_operating_cost_savings_usd !== undefined &&
    (!nullableNumber(v.annual_operating_cost_savings_usd) ||
      Number(v.annual_operating_cost_savings_usd) < 0)
  )
    return false;
  if (
    ["needs_data", "not_applicable"].includes(String(v.calculation_status)) &&
    v.annual_operating_cost_savings_usd != null
  )
    return false;
  const p = v.provenance;
  if (
    !enumValue(p.kind, evidenceKinds) ||
    !string(p.reference) ||
    !string(p.load_id) ||
    !(p.rate_source === null || string(p.rate_source))
  )
    return false;
  if (
    (v.upfront_cost_usd !== null && Number(v.upfront_cost_usd) < 0) ||
    (v.simple_payback_years !== null && Number(v.simple_payback_years) < 0)
  )
    return false;
  if (v.calculation_status === "quantified" && p.kind !== "measured")
    return false;
  if (
    ["needs_data", "not_applicable"].includes(String(v.calculation_status)) &&
    !recommendationNumbers
      .filter((k) => k !== "upfront_cost_usd")
      .every((k) => v[k] === null)
  )
    return false;
  return (
    v.calculation_status !== "not_applicable" ||
    (v.applicability === "not_applicable" &&
      v.priority_group === "not_applicable")
  );
}
export function isSavingsResponse(v: unknown): v is SavingsResponse {
  if (
    !object(v) ||
    v.version !== "1" ||
    v.portfolio_savings_usd !== null ||
    !string(v.location_notice) ||
    !strings(v.warnings) ||
    !Array.isArray(v.recommendations) ||
    v.recommendations.length > 116 ||
    !v.recommendations.every(validRecommendation) ||
    new Set(v.recommendations.map((r) => r.id)).size !==
      v.recommendations.length
  )
    return false;
  if (v.benchmark === null) return true;
  const b = v.benchmark;
  return (
    object(b) &&
    string(b.state) &&
    states.some((s) => s.name === b.state) &&
    b.sector === "COM" &&
    b.currency === "USD" &&
    b.unit === "USD/kWh" &&
    nullableNumber(b.average_retail_price) &&
    (b.average_retail_price === null || Number(b.average_retail_price) >= 0) &&
    string(b.period) &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(b.period) &&
    string(b.source) &&
    url(b.source_url) &&
    string(b.retrieved_at) &&
    /^\d{4}-\d{2}-\d{2}T/.test(b.retrieved_at) &&
    Number.isFinite(Date.parse(b.retrieved_at)) &&
    string(b.released_at) &&
    validDate(b.released_at) &&
    enumValue(b.freshness, ["available", "saved", "delayed"]) &&
    b.provenance === "historical_public_data" &&
    string(b.notice)
  );
}
export function isSavingsConversation(
  v: unknown,
): v is SavingsConversationResponse {
  return (
    object(v) &&
    enumValue(v.source, ["meta", "deterministic_fallback"]) &&
    string(v.message) &&
    Array.isArray(v.selected_categories) &&
    v.selected_categories.length <= 16 &&
    v.selected_categories.every(category) &&
    new Set(v.selected_categories).size === v.selected_categories.length &&
    strings(v.facts) &&
    strings(v.follow_up_questions) &&
    isSavingsResponse(v.savings)
  );
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!object(a) || !object(b)) return false;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
  );
}
/** Bind every supplied measure and returned input to this exact request, without recalculating money. */
export function matchesSavings(
  response: SavingsResponse,
  request: SavingsRequest,
): boolean {
  const measures = request.measures ?? [];
  if (
    !measures.every((m) => response.recommendations.some((r) => r.id === m.id))
  )
    return false;
  return response.recommendations.every((r) => {
    const m = measures.find((m) => m.id === r.id);
    if (!m)
      return (
        r.id === `catalog:${r.category}` &&
        !measures.some((m) => m.category === r.category) &&
        r.calculation_status !== "quantified" &&
        r.calculation_status !== "scenario_estimate" &&
        r.annual_operating_cost_savings_usd == null &&
        recommendationNumbers.every((k) => r[k] === null)
      );
    const required = [
      "id",
      "category",
      "load_id",
      "evidence_kind",
      "evidence_reference",
      "applicable",
      "rate",
      "installation_cost_usd",
      "annual_incremental_cost_usd",
      "annual_operating_cost_savings_usd",
      "operating_cost_savings_reference",
      ...measureBooleans,
      ...(isCalculatedCategory(m.category)
        ? calculationFields[m.category]
        : []),
    ];
    return (
      required.every(
        (k) =>
          m[k as keyof SavingsMeasure] == null ||
          same(r.inputs_used[k], m[k as keyof SavingsMeasure]),
      ) &&
      r.category === m.category &&
      r.provenance.kind === m.evidence_kind &&
      r.provenance.reference === m.evidence_reference &&
      r.provenance.load_id === m.load_id &&
      Object.entries(r.inputs_used).every(([k, v]) =>
        same(v, m[k as keyof SavingsMeasure]),
      )
    );
  });
}
// Catalog is read-only. Calculations may wait for the benchmark service. Provider
// uses one 25s SDK invocation plus deterministic/EIA work; this is a client wait
// budget, not a server deadline. No automatic retries, particularly for paid AI.
export const SAVINGS_TIMEOUT_MS = 75000;
export const SAVINGS_CONVERSATION_TIMEOUT_MS = 90000;
const signal = (external: AbortSignal | undefined, ms: number) =>
  external
    ? AbortSignal.any([external, AbortSignal.timeout(ms)])
    : AbortSignal.timeout(ms);
export async function getSavingsCatalog(abort?: AbortSignal) {
  const v = await apiRequest<unknown>("/api/savings/catalog", {
    signal: signal(abort, BACKEND_CONNECT_TIMEOUT_MS),
  });
  if (!isSavingsCatalog(v))
    throw new Error(
      "The savings catalog could not be validated. No guidance was accepted.",
    );
  return v;
}
export async function calculateSavings(
  request: SavingsRequest,
  abort?: AbortSignal,
) {
  if (!isSavingsRequest(request))
    throw new Error(
      "Correct the savings input validation errors before submitting.",
    );
  const v = await apiRequest<unknown>("/api/savings/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: signal(abort, SAVINGS_TIMEOUT_MS),
  });
  if (!isSavingsResponse(v) || !matchesSavings(v, request))
    throw new Error(
      "The backend returned an invalid or mismatched savings response. No new result was accepted.",
    );
  return v;
}
export async function converseSavings(
  request: SavingsConversationRequest,
  abort?: AbortSignal,
) {
  if (
    !isSavingsRequest(request.evidence) ||
    !request.request.trim() ||
    request.request.length > 2000 ||
    (request.history &&
      (!Array.isArray(request.history) ||
        request.history.length > 12 ||
        request.history.some(
          (t) =>
            !["user", "assistant"].includes(t.role) ||
            !t.content.trim() ||
            t.content.length > 3000,
        ))) ||
    !Object.entries(request.category_applicability ?? {}).every(
      ([k, v]) => category(k) && typeof v === "boolean",
    )
  )
    throw new Error(
      "Correct the savings conversation inputs before submitting.",
    );
  const v = await apiRequest<unknown>("/api/ai/savings/conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: signal(abort, SAVINGS_CONVERSATION_TIMEOUT_MS),
  });
  if (
    !isSavingsConversation(v) ||
    !matchesSavings(v.savings, request.evidence) ||
    v.selected_categories.some(
      (c) => request.category_applicability?.[c] === false,
    ) ||
    v.savings.recommendations.some(
      (r) =>
        request.category_applicability?.[r.category] === false &&
        r.calculation_status !== "not_applicable",
    )
  )
    throw new Error(
      "The backend returned invalid savings selections or evidence. No new result was accepted.",
    );
  return v;
}
export function savingsFailure(error: unknown): {
  message: string;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const d = object(error.body) ? error.body.detail : undefined;
      if (Array.isArray(d))
        for (const item of d)
          if (object(item) && Array.isArray(item.loc) && string(item.msg)) {
            const path = item.loc
              .filter((v) => v !== "body" && v !== "evidence")
              .join(".");
            fields[path || "request"] = item.msg;
          }
      return {
        message:
          "The backend rejected these inputs (HTTP 422). Correct the fields below; your evidence has been retained.",
        fields,
      };
    }
    return {
      message: `Savings service unavailable (HTTP ${error.status}). Your inputs and previous results are retained. Retry explicitly; the non-AI calculation remains available.`,
      fields,
    };
  }
  if (error instanceof Error && error.name === "TimeoutError")
    return {
      message:
        "Stopped waiting for savings results. The server may still be processing; wait before explicitly retrying. No new result was accepted.",
      fields,
    };
  return {
    message:
      error instanceof TypeError
        ? "Savings service could not be reached. Your inputs are retained; retry explicitly."
        : error instanceof Error
          ? error.message
          : "Savings request failed. Your inputs are retained.",
    fields,
  };
}
