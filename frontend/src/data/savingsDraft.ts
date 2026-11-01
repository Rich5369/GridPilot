import type {
  SavingsDraft,
  SavingsMeasureDraft,
  SavingsCategory,
  SavingsProfile,
  SavingsRequest,
  SavingsMeasure,
  Confirmation,
  MeasureBoolean,
} from "../types/savings";
import {
  measureNumbers,
  measureBooleans,
  savingsCategories,
  evidenceKinds,
} from "../types/savings";
import states from "../data/usStates.json";
import example from "../../../docs/verification/savings-request.json";
export const profileLimits = {
  business_type: 120,
  employee_count: 10000000,
  operating_hours: 200,
  electricity_cost_and_period: 200,
  consumption_and_units: 200,
  equipment: 500,
  goals: 500,
  restrictions: 500,
} as const;
export const locationLimits = {
  state: 100,
  zip_code: 10,
  city: 120,
  utility: 200,
  rate_plan: 200,
} as const;
export const numericLabels: Record<(typeof measureNumbers)[number], string> = {
  fixture_count: "Fixture count",
  old_watts: "Existing watts per fixture (W)",
  new_watts: "Replacement watts per fixture (W)",
  hours_per_day: "Equipment runtime (hours/day)",
  days_per_year: "Operating days per year",
  connected_load_kw: "Connected load (kW)",
  existing_hours_per_day: "Existing equipment runtime (hours/day)",
  avoidable_hours_per_day: "Avoidable equipment runtime (hours/day)",
  device_count: "Device count",
  active_watts: "Active watts per device (W)",
  low_power_watts: "Low-power watts per device (W)",
  before_annual_kwh: "Comparable before consumption (kWh/year)",
  after_annual_kwh: "Comparable after consumption (kWh/year)",
  installation_cost_usd: "Net upfront installation cost (USD)",
  annual_incremental_cost_usd: "Annual incremental operating cost (USD/year)",
  annual_operating_cost_savings_usd:
    "Recurring non-energy cost savings (USD/year)",
};
export const booleanLabels = {
  applicable: "Does this project apply to your equipment?",
  safe_to_switch_off: "Confirmed safe to switch off?",
  essential_service: "Does it provide an essential service?",
  equivalent_service_confirmed: "Equivalent service confirmed?",
};
export const calculationFields = {
  led: [
    "fixture_count",
    "old_watts",
    "new_watts",
    "hours_per_day",
    "days_per_year",
  ],
  lighting_controls: [
    "connected_load_kw",
    "existing_hours_per_day",
    "avoidable_hours_per_day",
    "days_per_year",
  ],
  shutdown: [
    "connected_load_kw",
    "existing_hours_per_day",
    "avoidable_hours_per_day",
    "days_per_year",
  ],
  office: [
    "device_count",
    "active_watts",
    "low_power_watts",
    "existing_hours_per_day",
    "avoidable_hours_per_day",
    "days_per_year",
  ],
  motor: ["before_annual_kwh", "after_annual_kwh"],
  refrigeration: ["before_annual_kwh", "after_annual_kwh"],
} as const;
export type CalculatedCategory = keyof typeof calculationFields;
export function isCalculatedCategory(
  category: SavingsCategory,
): category is CalculatedCategory {
  return Object.hasOwn(calculationFields, category);
}
export const confirmation = (value: Confirmation) =>
  value === "" ? null : value === "yes";
export const emptySavingsDraft = (): SavingsDraft => ({
  location: { state: "", zip_code: "", city: "", utility: "", rate_plan: "" },
  measures: [],
  applicability: {},
  question: "",
});
export function newSavingsMeasure(
  category: SavingsCategory,
  id = `project-${crypto.randomUUID()}`,
): SavingsMeasureDraft {
  return {
    id,
    category,
    load_id: "",
    evidence_kind: "user_entered",
    evidence_reference: "",
    operating_cost_savings_reference: "",
    numbers: Object.fromEntries(
      measureNumbers.map((k) => [k, ""]),
    ) as SavingsMeasureDraft["numbers"],
    confirmations: {
      applicable: "",
      safe_to_switch_off: "",
      essential_service: "",
      equivalent_service_confirmed: "",
    },
    rateEnabled: false,
    rate: {
      usd_per_kwh: "",
      source: "",
      valid_from: "",
      valid_through: "",
      customer_applicability_confirmed: "",
      flat_avoidable_energy_rate_confirmed: "",
    },
  };
}
export function measureToDraft(m: SavingsMeasure): SavingsMeasureDraft {
  const d = newSavingsMeasure(m.category, m.id);
  d.load_id = m.load_id;
  d.evidence_kind = m.evidence_kind;
  d.evidence_reference = m.evidence_reference;
  d.operating_cost_savings_reference = m.operating_cost_savings_reference ?? "";
  for (const k of measureNumbers)
    d.numbers[k] = m[k] == null ? "" : String(m[k]);
  for (const k of measureBooleans)
    d.confirmations[k] = m[k] == null ? "" : m[k] ? "yes" : "no";
  if (m.rate) {
    d.rateEnabled = true;
    d.rate = {
      ...m.rate,
      usd_per_kwh: String(m.rate.usd_per_kwh),
      customer_applicability_confirmed: m.rate.customer_applicability_confirmed
        ? "yes"
        : "no",
      flat_avoidable_energy_rate_confirmed: m.rate
        .flat_avoidable_energy_rate_confirmed
        ? "yes"
        : "no",
    };
  }
  return d;
}
export function syntheticLedDraft(): SavingsMeasureDraft {
  return measureToDraft(example.measures[0] as SavingsMeasure);
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
const exact = (v: Record<string, unknown>, keys: string[]) =>
  keys.length === Object.keys(v).length &&
  keys.every((k) => Object.hasOwn(v, k));
const choice = (v: unknown, options: readonly string[]) =>
  typeof v === "string" && options.includes(v);
export function validSavingsDraft(v: unknown): v is SavingsDraft {
  if (
    !object(v) ||
    !exact(v, ["location", "measures", "applicability", "question"]) ||
    !object(v.location) ||
    !exact(v.location, Object.keys(locationLimits)) ||
    !Object.entries(locationLimits).every(([k, max]) =>
      text(v.location && object(v.location) ? v.location[k] : null, max),
    ) ||
    !object(v.applicability) ||
    !Object.entries(v.applicability).every(
      ([k, val]) =>
        choice(k, savingsCategories) && choice(val, ["", "yes", "no"]),
    ) ||
    !text(v.question, 2000) ||
    !Array.isArray(v.measures) ||
    v.measures.length > 100
  )
    return false;
  if (
    !v.measures.every(
      (m) =>
        object(m) &&
        exact(m, [
          "id",
          "category",
          "load_id",
          "evidence_kind",
          "evidence_reference",
          "operating_cost_savings_reference",
          "numbers",
          "confirmations",
          "rateEnabled",
          "rate",
        ]) &&
        text(m.id, 100) &&
        choice(m.category, savingsCategories) &&
        text(m.load_id, 100) &&
        choice(m.evidence_kind, evidenceKinds) &&
        text(m.evidence_reference, 500) &&
        text(m.operating_cost_savings_reference, 500) &&
        object(m.numbers) &&
        exact(m.numbers, [...measureNumbers]) &&
        Object.values(m.numbers).every(
          (n) =>
            text(n, 100) &&
            (String(n).trim() === "" || Number.isFinite(Number(n))),
        ) &&
        object(m.confirmations) &&
        exact(m.confirmations, [...measureBooleans]) &&
        Object.values(m.confirmations).every((c) =>
          choice(c, ["", "yes", "no"]),
        ) &&
        typeof m.rateEnabled === "boolean" &&
        object(m.rate) &&
        exact(m.rate, [
          "usd_per_kwh",
          "source",
          "valid_from",
          "valid_through",
          "customer_applicability_confirmed",
          "flat_avoidable_energy_rate_confirmed",
        ]) &&
        text(m.rate.usd_per_kwh, 100) &&
        (String(m.rate.usd_per_kwh).trim() === "" ||
          Number.isFinite(Number(m.rate.usd_per_kwh))) &&
        text(m.rate.source, 500) &&
        text(m.rate.valid_from, 10) &&
        text(m.rate.valid_through, 10) &&
        choice(m.rate.customer_applicability_confirmed, ["", "yes", "no"]) &&
        choice(m.rate.flat_avoidable_energy_rate_confirmed, ["", "yes", "no"]),
    )
  )
    return false;
  return JSON.stringify(v).length <= 150000;
}
export function mapSavingsProfile(
  profile: Record<string, string | number | null> | undefined,
): SavingsProfile {
  return Object.fromEntries(
    Object.keys(profileLimits).map((k) => [
      k,
      profile?.[k] === "" ? null : (profile?.[k] ?? null),
    ]),
  ) as SavingsProfile;
}
export const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export type SavingsErrors = Record<string, string>;
export function buildSavingsRequest(
  draft: SavingsDraft,
  profile: SavingsProfile,
): { request: SavingsRequest; errors: SavingsErrors } {
  const errors: SavingsErrors = {};
  for (const [k, max] of Object.entries(profileLimits)) {
    const v = profile[k as keyof SavingsProfile];
    if (v == null) continue;
    if (
      k === "employee_count"
        ? typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max
        : typeof v !== "string" || v.length > max
    )
      errors["profile." + k] =
        `Provide a valid ${k.replaceAll("_", " ")}${k === "employee_count" ? " (whole number from 0 to 10,000,000)" : ""}.`;
  }
  for (const [k, max] of Object.entries(locationLimits)) {
    const v = draft.location[k as keyof typeof locationLimits];
    if (v.length > max)
      errors["location." + k] = `Use at most ${max} characters.`;
  }
  if (
    draft.location.state &&
    !states.some((s) => s.name === draft.location.state)
  )
    errors["location.state"] = "Choose a full U.S. state name.";
  if (
    draft.location.zip_code &&
    !/^\d{5}(-\d{4})?$/.test(draft.location.zip_code)
  )
    errors["location.zip_code"] =
      "Use a five-digit ZIP or ZIP+4; no location is inferred from it.";
  const ids = new Set<string>();
  const measures = draft.measures.map((m, i) => {
    const prefix = `measures.${i}.`,
      fail = (k: string, message: string) => {
        errors[prefix + k] = message;
      };
    if (
      !m.id.trim() ||
      m.id.length > 100 ||
      m.id.startsWith("catalog:") ||
      ids.has(m.id)
    )
      fail(
        "id",
        "Use a unique project ID (1–100 characters, not the reserved catalog: prefix).",
      );
    ids.add(m.id);
    if (!m.load_id.trim() || m.load_id.length > 100)
      fail(
        "load_id",
        "Identify the actual load or equipment (up to 100 characters). Use the same ID for overlapping projects.",
      );
    if (!m.evidence_reference.trim() || m.evidence_reference.length > 500)
      fail(
        "evidence_reference",
        "Describe the source, baseline period and units (up to 500 characters).",
      );
    const result: SavingsMeasure = {
      id: m.id,
      category: m.category,
      load_id: m.load_id,
      evidence_kind: m.evidence_kind,
      evidence_reference: m.evidence_reference,
    };
    const activeNumbers = new Set<string>([
      ...(isCalculatedCategory(m.category)
        ? calculationFields[m.category]
        : []),
      "installation_cost_usd",
      "annual_incremental_cost_usd",
      "annual_operating_cost_savings_usd",
    ]);
    for (const k of measureNumbers) {
      if (!activeNumbers.has(k)) continue;
      const value = m.numbers[k].trim();
      const n = value === "" ? null : Number(value);
      const maximum = [
        "hours_per_day",
        "existing_hours_per_day",
        "avoidable_hours_per_day",
      ].includes(k)
        ? 24
        : k === "days_per_year"
          ? 366
          : ["fixture_count", "device_count"].includes(k)
            ? 10000000
            : 1e12;
      if (
        n !== null &&
        (!Number.isFinite(n) ||
          n < 0 ||
          n > maximum ||
          (["fixture_count", "device_count", "days_per_year"].includes(k) &&
            (!Number.isInteger(n) || n < 1)))
      )
        fail(
          k,
          `Enter a finite ${["fixture_count", "device_count", "days_per_year"].includes(k) ? "whole " : ""}number in the supported range (maximum ${maximum}), or leave unknown.`,
        );
      result[k] = n;
    }
    const benefitReference = m.operating_cost_savings_reference;
    result.operating_cost_savings_reference = benefitReference.trim()
      ? benefitReference
      : null;
    if (
      benefitReference.length > 500 ||
      ((result.annual_operating_cost_savings_usd ?? 0) > 0 &&
        !benefitReference.trim())
    )
      fail(
        "operating_cost_savings_reference",
        "Positive recurring non-energy savings require their own source and annual basis (up to 500 characters).",
      );
    const activeFlags: MeasureBoolean[] = [
      "applicable",
      ...(["led", "motor", "refrigeration"].includes(m.category)
        ? (["equivalent_service_confirmed"] as const)
        : (["safe_to_switch_off", "essential_service"] as const)),
    ];
    for (const k of activeFlags) result[k] = confirmation(m.confirmations[k]);
    if (draft.applicability[m.category] === "no" && result.applicable !== false)
      fail(
        "applicable",
        "This category is excluded. Confirm this project does not apply or correct the category confirmation.",
      );
    for (const [before, after] of [
      ["old_watts", "new_watts"],
      ["active_watts", "low_power_watts"],
    ] as const) {
      if (
        result[before] != null &&
        result[after] != null &&
        (result[before]! <= 0 || result[after]! > result[before]!)
      )
        fail(
          after,
          "Replacement power cannot exceed existing power, which must be positive.",
        );
    }
    if (
      m.category === "led" &&
      result.new_watts != null &&
      result.new_watts <= 0
    )
      fail("new_watts", "Replacement lighting must have positive wattage.");
    if (
      result.existing_hours_per_day != null &&
      result.avoidable_hours_per_day != null &&
      result.avoidable_hours_per_day > result.existing_hours_per_day
    )
      fail(
        "avoidable_hours_per_day",
        "Avoidable hours cannot exceed existing equipment hours.",
      );
    result.rate = null;
    if (m.rateEnabled) {
      const r = m.rate,
        n = Number(r.usd_per_kwh);
      if (
        r.usd_per_kwh.trim() === "" ||
        !Number.isFinite(n) ||
        n < 0 ||
        n > 100
      )
        fail(
          "rate.usd_per_kwh",
          "Enter the documented customer rate from 0 to 100 USD/kWh, or omit the rate.",
        );
      if (!r.source.trim() || r.source.length > 500)
        fail(
          "rate.source",
          "Identify the customer rate source (up to 500 characters).",
        );
      for (const key of ["valid_from", "valid_through"] as const)
        if (!validDate(r[key]))
          fail("rate." + key, "Provide a valid ISO calendar date.");
      if (
        validDate(r.valid_from) &&
        validDate(r.valid_through) &&
        r.valid_through < r.valid_from
      )
        fail(
          "rate.valid_through",
          "Rate expiry cannot precede its effective date.",
        );
      for (const key of [
        "customer_applicability_confirmed",
        "flat_avoidable_energy_rate_confirmed",
      ] as const)
        if (r[key] === "")
          fail(
            "rate." + key,
            "Confirm Yes or No, or omit this rate. Unconfirmed rates do not enable financial calculations.",
          );
      result.rate = {
        usd_per_kwh: n,
        source: r.source,
        valid_from: r.valid_from,
        valid_through: r.valid_through,
        customer_applicability_confirmed:
          r.customer_applicability_confirmed === "yes",
        flat_avoidable_energy_rate_confirmed:
          r.flat_avoidable_energy_rate_confirmed === "yes",
      };
    }
    return result;
  });
  return {
    request: {
      profile,
      location: Object.fromEntries(
        Object.entries(draft.location).map(([k, v]) => [
          k,
          v.trim() === "" ? null : v,
        ]),
      ),
      measures,
    },
    errors,
  };
}
export function categoryApplicability(draft: SavingsDraft) {
  return Object.fromEntries(
    Object.entries(draft.applicability)
      .filter(([, v]) => v === "yes" || v === "no")
      .map(([k, v]) => [k, v === "yes"]),
  ) as Partial<Record<SavingsCategory, boolean>>;
}
