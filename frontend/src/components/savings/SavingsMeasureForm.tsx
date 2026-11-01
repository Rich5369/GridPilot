import type {
  SavingsMeasureDraft,
  MeasureNumber,
  MeasureBoolean,
  Confirmation,
} from "../../types/savings";
import { evidenceKinds } from "../../types/savings";
import {
  numericLabels,
  booleanLabels,
  calculationFields,
  isCalculatedCategory,
} from "../../data/savingsDraft";
import type { SavingsErrors } from "../../data/savingsDraft";
const evidenceLabels = {
  user_entered: "User-entered estimate",
  measured: "Caller-reported measurements (not audited)",
  synthetic: "Synthetic example (not customer evidence)",
  engineering_assumption: "Engineering assumption",
};
export function ConfirmSelect({
  id,
  value,
  onChange,
  label,
  error,
}: {
  id: string;
  value: Confirmation;
  onChange: (v: Confirmation) => void;
  label: string;
  error?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as Confirmation)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">Not sure / not provided</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function SavingsMeasureForm({
  measure: m,
  index,
  errors,
  onChange,
  onRemove,
  title,
  open,
}: {
  measure: SavingsMeasureDraft;
  index: number;
  errors: SavingsErrors;
  onChange: (m: SavingsMeasureDraft) => void;
  onRemove: () => void;
  title: string;
  open?: boolean;
}) {
  const prefix = `measures.${index}.`,
    id = (key: string) => `savings-${index}-${key.replaceAll(".", "-")}`;
  const field = (
    key: string,
    label: string,
    value: string,
    max: number,
    onInput: (v: string) => void,
    type = "text",
  ) => (
    <div className="field" key={key}>
      <label htmlFor={id(key)}>{label}</label>
      <input
        id={id(key)}
        type={type}
        value={value}
        maxLength={max}
        onChange={(e) => onInput(e.target.value)}
        aria-invalid={!!errors[prefix + key]}
        aria-describedby={errors[prefix + key] ? id(key) + "-error" : undefined}
      />
      {errors[prefix + key] && (
        <p id={id(key) + "-error"} className="field-error">
          {errors[prefix + key]}
        </p>
      )}
    </div>
  );
  const number = (key: MeasureNumber) =>
    field(
      key,
      numericLabels[key] + " · leave blank if unknown",
      m.numbers[key],
      100,
      (value) => onChange({ ...m, numbers: { ...m.numbers, [key]: value } }),
      "number",
    );
  const bool = (key: MeasureBoolean) => (
    <ConfirmSelect
      key={key}
      id={id(key)}
      label={booleanLabels[key]}
      value={m.confirmations[key]}
      onChange={(value) =>
        onChange({ ...m, confirmations: { ...m.confirmations, [key]: value } })
      }
      error={errors[prefix + key]}
    />
  );
  const equivalent = ["led", "motor", "refrigeration"].includes(m.category);
  return (
    <details
      className="savings-project-form"
      open={open}
      id={`savings-project-${index}`}
    >
      <summary>
        {title} · {m.id || "Project ID needed"}
        {Object.keys(errors).some((k) => k.startsWith(prefix))
          ? " · Check inputs"
          : ""}
      </summary>
      <div className="savings-project-body">
        <div className="section-heading">
          <p className="muted">
            Evidence for one standalone project. Use the same load ID for
            projects affecting the same equipment.
          </p>
          <button type="button" className="secondary" onClick={onRemove}>
            Remove project
          </button>
        </div>
        <div className="form-grid">
          {field("id", "Improvement reference", m.id, 100, (value) =>
            onChange({ ...m, id: value }),
          )}
          {field("load_id", "Equipment reference (same equipment, same reference)", m.load_id, 100, (value) =>
            onChange({ ...m, load_id: value }),
          )}
          <div className="field">
            <label htmlFor={id("evidence_kind")}>Where did this information come from?</label>
            <select
              id={id("evidence_kind")}
              value={m.evidence_kind}
              onChange={(e) =>
                onChange({
                  ...m,
                  evidence_kind: e.target
                    .value as SavingsMeasureDraft["evidence_kind"],
                })
              }
            >
              {evidenceKinds.map((k) => (
                <option key={k} value={k}>
                  {evidenceLabels[k]}
                </option>
              ))}
            </select>
          </div>
          {field(
            "evidence_reference",
            "Evidence source, baseline period and units",
            m.evidence_reference,
            500,
            (value) => onChange({ ...m, evidence_reference: value }),
          )}
          {bool("applicable")}
        </div>
        <p className="field-hint">
          Equipment runtime is not inferred from business opening hours.
          Measurements and safety confirmations are your attestations, not
          independent verification.
        </p>
        <div className="form-grid">
          {isCalculatedCategory(m.category) &&
            calculationFields[m.category].map(number)}
          {["office", "shutdown", "lighting_controls"].includes(m.category) &&
            bool("operating_baseline_confirmed")}
          {["motor", "refrigeration"].includes(m.category) &&
            bool("comparison_conditions_confirmed")}
          {equivalent ? (
            bool("equivalent_service_confirmed")
          ) : (
            <>
              {bool("safe_to_switch_off")}
              {bool("essential_service")}
            </>
          )}
        </div>
        {m.category !== "led" && (
          <p className="field-hint">
            Optional evidence confirmations do not replace safety or
            equivalent-service requirements. Unknown or No retains the backend's
            advisory limitations without correcting values or blocking otherwise
            eligible calculations. Describe specification projections and actual
            operating conditions in the evidence reference.
          </p>
        )}
        {!equivalent && (
          <p className="savings-warning">
            Never switch off critical refrigeration, security, ventilation,
            process or safety equipment. Calculations require explicit
            safe-to-switch-off Yes and essential-service No.
          </p>
        )}
        <details className="savings-financial" open={m.rateEnabled}>
          <summary>Customer rate and project costs</summary>
          <p className="field-hint">
            Blank costs are unknown. Enter 0 only after confirming there is no
            incremental cost. Upfront cost and annual operating cost are
            separate.
          </p>
          <div className="form-grid">
            {number("installation_cost_usd")}
            {number("annual_incremental_cost_usd")}
            {number("annual_operating_cost_savings_usd")}
            {field(
              "operating_cost_savings_reference",
              "Recurring non-energy savings source and annual basis",
              m.operating_cost_savings_reference,
              500,
              (value) =>
                onChange({ ...m, operating_cost_savings_reference: value }),
            )}
          </div>
          <p className="field-hint">
            Optional recurring non-energy savings, such as reduced maintenance,
            need a separate documented annual basis when positive. Blank means
            not included in this estimate, not confirmed zero benefit. Exclude
            electricity savings, demand charges, one-time incentives and any
            reduction already counted in incremental expenses or other projects.
          </p>
          <label className="savings-check">
            <input
              type="checkbox"
              checked={m.rateEnabled}
              onChange={(e) =>
                onChange({ ...m, rateEnabled: e.target.checked })
              }
            />
            Include a documented customer-specific flat avoidable energy rate
          </label>
          <p className="field-hint">
            Unknown rate? Leave it out: energy calculations can remain
            available. EIA benchmarks, monthly bills and demonstration hourly
            prices never fill this rate. No demand charges or full bill
            forecast.
          </p>
          {m.rateEnabled && (
            <div className="form-grid">
              {field(
                "rate.usd_per_kwh",
                "Customer energy rate (USD/kWh)",
                m.rate.usd_per_kwh,
                100,
                (value) =>
                  onChange({ ...m, rate: { ...m.rate, usd_per_kwh: value } }),
                "number",
              )}
              {field(
                "rate.source",
                "Customer rate source",
                m.rate.source,
                500,
                (value) =>
                  onChange({ ...m, rate: { ...m.rate, source: value } }),
              )}
              {(["valid_from", "valid_through"] as const).map((k) =>
                field(
                  "rate." + k,
                  k === "valid_from"
                    ? "Rate effective from"
                    : "Rate valid through",
                  m.rate[k],
                  10,
                  (value) =>
                    onChange({ ...m, rate: { ...m.rate, [k]: value } }),
                  "date",
                ),
              )}
              <ConfirmSelect
                id={id("rate.customer_applicability_confirmed")}
                label="Rate applies to this customer?"
                value={m.rate.customer_applicability_confirmed}
                onChange={(v) =>
                  onChange({
                    ...m,
                    rate: { ...m.rate, customer_applicability_confirmed: v },
                  })
                }
                error={errors[prefix + "rate.customer_applicability_confirmed"]}
              />
              <ConfirmSelect
                id={id("rate.flat_avoidable_energy_rate_confirmed")}
                label="Confirmed flat avoidable energy charges?"
                value={m.rate.flat_avoidable_energy_rate_confirmed}
                onChange={(v) =>
                  onChange({
                    ...m,
                    rate: {
                      ...m.rate,
                      flat_avoidable_energy_rate_confirmed: v,
                    },
                  })
                }
                error={
                  errors[prefix + "rate.flat_avoidable_energy_rate_confirmed"]
                }
              />
            </div>
          )}
          <p className="field-hint">
            Expired, future or unconfirmed rates leave monetary results unknown;
            the backend evaluates validity. Dates are never repaired
            automatically.
          </p>
        </details>
      </div>
    </details>
  );
}
