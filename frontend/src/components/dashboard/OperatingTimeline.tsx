import { useState } from "react";
import type { OptimizationResult, Scenario } from "../../types/api";
import type { SchedulingMode } from "../../services/api";
import "./operating-timeline.css";
const number = (n: number) =>
  n === 0
    ? "0"
    : n < 0.001
      ? n.toExponential(6)
      : Number(n.toPrecision(7)).toString();
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
export function OperatingTimeline({
  result,
  scenario,
  mode,
  stale,
}: {
  result: OptimizationResult | null;
  scenario: Scenario | null;
  mode: SchedulingMode;
  stale: boolean;
}) {
  const [view, setView] = useState<"baseline" | "optimized">("optimized");
  const [selection, setSelection] = useState(
    "Hover, focus or select an hour to inspect returned power.",
  );
  if (!result) return null;
  const plan = result.operating_plan;
  const verified =
    result.feasibility_status === "feasible" &&
    plan?.verification_status === "passed";
  const shown = verified ? view : "baseline";
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              scheduling_mode: mode,
              submitted_scenario: scenario,
              response: result,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "gridpilot-submitted-operating-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      className="panel operating-timeline"
      aria-label="Device operating schedule"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">EQUIPMENT / SAME-SOLVE OPERATING PLAN</p>
          <h2>Device operating timeline</h2>
        </div>
        <span className="tag">
          {stale
            ? "PREVIOUS SCENARIO · STALE"
            : mode === "joint"
              ? "JOINT SCHEDULING"
              : "EV-ONLY SCHEDULING"}
        </span>
      </div>
      {stale && (
        <p className="warning" role="status">
          Previous submitted scenario. Inputs changed; run optimization before
          using this plan for the current draft.
        </p>
      )}
      {!plan ? (
        <p>
          Device schedules are unavailable in this older response. Run
          optimization against an E1-enabled backend.
        </p>
      ) : (
        <>
          <p className="muted">
            24 building-local hours · Hourly-average grid-side power · Exact
            returned device schedules.
          </p>
          <div className="plan-proof">
            <div>
              <small>ENGINEERING VERIFICATION</small>
              <strong>
                {verified
                  ? "Passed modeled constraints"
                  : "Optimized plan unavailable"}
              </strong>
            </div>
            <div>
              <small>PRIMARY ENERGY COST</small>
              <strong>
                {plan.primary_status === "optimal"
                  ? "Optimum proved"
                  : plan.primary_status === "feasible"
                    ? "Feasible · optimum unproved"
                    : "Infeasible"}
              </strong>
              {plan.primary_optimum_usd !== null && (
                <span>
                  ${number(plan.primary_optimum_usd)} energy-only optimum
                </span>
              )}
            </div>
            <div>
              <small>PEAK TIE-BREAK</small>
              <strong>
                {plan.peak_tiebreak_status === "optimal"
                  ? "Minimum peak proved"
                  : plan.peak_tiebreak_status === "feasible"
                    ? "Feasible · minimum unproved"
                    : plan.peak_tiebreak_status === "unresolved"
                      ? "Unresolved · minimum unproved"
                      : "Not run"}
              </strong>
            </div>
          </div>
          {plan.warnings.length > 0 && (
            <div className="warning">
              <strong>Solver warnings</strong>
              <ul>
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {!verified && (
            <div className="warning">
              <strong>
                No optimized device instructions available. Baseline is
                informational only.
              </strong>
              <ul>
                {result.constraint_violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="plan-toolbar">
            <div
              className="plan-switch"
              role="group"
              aria-label="Schedule view"
            >
              <button
                disabled={!verified}
                aria-pressed={shown === "optimized"}
                onClick={() => {
                  setView("optimized");
                  setSelection("Select an hour to inspect optimized power.");
                }}
              >
                Optimized
              </button>
              <button
                aria-pressed={shown === "baseline"}
                onClick={() => {
                  setView("baseline");
                  setSelection("Select an hour to inspect baseline power.");
                }}
              >
                Baseline
              </button>
            </div>
            <button className="secondary" onClick={download}>
              Export submitted evidence
            </button>
          </div>
          {shown === "baseline" && (
            <div
              className={
                plan.baseline_constraint_violations.length
                  ? "warning"
                  : "cost-note"
              }
            >
              <strong>
                {plan.baseline_constraint_violations.length
                  ? "Baseline violates modeled constraints · not compliant"
                  : "Uncontrolled earliest-start baseline"}
              </strong>
              <ul>
                {plan.baseline_constraint_violations.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="plan-legend">
            <span>
              <i />
              Scheduled · height = kW / maximum
            </span>
            <span>
              <i className="held" />
              Held at baseline
            </span>
            <span>
              <i className="unavailable" />
              Outside availability
            </span>
          </div>
          <div className="plan-axis" aria-hidden="true">
            <span>DEVICE / ENERGY</span>
            <div>
              {Array.from({ length: 25 }, (_, h) => (
                <span key={h}>
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
          </div>
          {!plan.device_schedules.length && (
            <p>
              No schedulable devices. Submitted building demand remains fixed.
            </p>
          )}
          {plan.device_schedules.map((d) => {
            const values = d[`${shown}_power_kw`],
              delivered = d[`${shown}_delivered_energy_kwh`];
            return (
              <article
                className="device-row"
                key={JSON.stringify([d.device_type, d.device_id])}
              >
                <div className="device-label">
                  <h3>{d.device_id}</h3>
                  <span>
                    {d.device_type === "ev" ? "EV" : "Flexible equipment"} ·{" "}
                    {d.scheduling_role === "held_at_baseline"
                      ? "Held at baseline"
                      : "Scheduled"}
                  </span>
                  <strong>
                    {delivered === null ? "Unavailable" : number(delivered)} /{" "}
                    {number(d.required_energy_kwh)} kWh
                  </strong>
                  <small>
                    Delivered / required · max {number(d.max_power_kw)} kW
                  </small>
                  <small>
                    {d.device_type === "ev"
                      ? "Arrival → deadline"
                      : "Availability"}{" "}
                    {hour(d.available_hours.start_hour)} →{" "}
                    {hour(d.available_hours.end_hour)} (exclusive)
                  </small>
                </div>
                <div
                  className="device-hours"
                  role="group"
                  aria-label={`${d.device_type} ${d.device_id} ${shown} hourly power`}
                >
                  {Array.from({ length: 24 }, (_, h) => {
                    const kw = values?.[h],
                      available =
                        h >= d.available_hours.start_hour &&
                        h < d.available_hours.end_hour;
                    const label = `${d.device_type} ${d.device_id}, ${hour(h)}–${hour(h + 1)}, ${kw == null ? "Unavailable" : `${String(kw)} kW`}, ${available ? "within availability" : "outside availability"}, ${d.scheduling_role === "held_at_baseline" ? "held at baseline" : shown}`;
                    return (
                      <button
                        key={h}
                        className={`hour-cell ${available ? (d.scheduling_role === "held_at_baseline" ? "held" : "scheduled") : "unavailable"}`}
                        title={label}
                        aria-label={label}
                        onMouseEnter={() => setSelection(label)}
                        onFocus={() => setSelection(label)}
                        onClick={() => setSelection(label)}
                      >
                        <span
                          className="hour-fill"
                          style={{
                            height: `${kw == null ? 0 : Math.min(100, (kw / d.max_power_kw) * 100)}%`,
                            minHeight: kw && kw > 0 ? 2 : 0,
                          }}
                        />
                        <span className="mobile-hour">{hour(h)}</span>
                        <span className="mobile-power">
                          {kw == null ? "—" : number(kw)} kW
                        </span>
                      </button>
                    );
                  })}
                </div>
                <details className="device-table">
                  <summary>
                    Exact hourly values · {d.device_type} {d.device_id}
                  </summary>
                  <table>
                    <caption>
                      Raw response kW · One-hour intervals, end exclusive
                    </caption>
                    <thead>
                      <tr>
                        <th>Hour</th>
                        <th>Baseline kW</th>
                        <th>Optimized kW</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.baseline_power_kw.map((kw, h) => (
                        <tr key={h}>
                          <th>
                            {hour(h)}–{hour(h + 1)}
                          </th>
                          <td>{String(kw)}</td>
                          <td>
                            {d.optimized_power_kw === null
                              ? "Unavailable"
                              : String(d.optimized_power_kw[h])}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </article>
            );
          })}
          <div className="plan-inspector" role="status" aria-live="polite">
            {selection}
          </div>
          <p className="cost-note">
            Equivalent optimal schedules can differ; this allocation belongs to
            this submission. Planning model: 100% EV efficiency; equipment can
            pause and vary power. No overnight, calendar, DST, thermal or
            uninterrupted-cycle model. Hourly peak is not utility billing
            demand.
          </p>
        </>
      )}
    </section>
  );
}
