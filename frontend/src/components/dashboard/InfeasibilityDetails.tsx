import { formatHour } from "../../data/time";
import type { OptimizationResult } from "../../types/api";
import { evidenceTitles } from "../../services/infeasibilityEvidence";
const hour = formatHour;
export function InfeasibilityDetails({
  result,
  stale = false,
}: {
  result: OptimizationResult;
  stale?: boolean;
}) {
  if (result.feasibility_status !== "infeasible") return null;
  const evidence = result.infeasibility_evidence;
  const legacy = (
    <ul className="violations">
      {result.constraint_violations.map((v, i) => (
        <li key={i}>{v}</li>
      ))}
    </ul>
  );
  if (!evidence?.length) return legacy;
  return (
    <section
      className="infeasibility-details"
      aria-label="Structured infeasibility evidence"
    >
      <h3>
        {stale
          ? "Previous submitted result · infeasibility evidence"
          : "Why these submitted constraints cannot be met"}
      </h3>
      <p className="muted">
        These certificates describe the submitted scenario, not just its
        uncontrolled baseline. They may overlap; do not add their shortfalls.
        They do not identify a unique cause or guarantee that any single change
        repairs the entire scenario.
      </p>
      <div className="evidence-grid">
        {evidence.map((e, i) => (
          <article className="evidence-card" key={i} data-reason-code={e.code}>
            <span className="eyebrow">
              {e.proof_source === "solver_infeasible"
                ? "GLOP infeasibility proof"
                : "Verified necessary-condition violation"}
            </span>
            <h4>{evidenceTitles[e.code]}</h4>
            <p>{e.message}</p>
            <dl>
              <div>
                <dt>Scheduling mode</dt>
                <dd>
                  {e.context.scheduling_mode === "joint"
                    ? "EV + flexible equipment"
                    : "EV-only · flexible equipment held at baseline"}
                </dd>
              </div>
              {e.window && (
                <div>
                  <dt>Exclusive window</dt>
                  <dd>
                    {hour(e.window.start_hour)}–{hour(e.window.end_hour)} · end
                    excluded
                  </dd>
                </div>
              )}
              {e.unit && (
                <>
                  <div>
                    <dt>Required</dt>
                    <dd data-quantity="required">
                      {String(e.required)} {e.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Available / allowed bound</dt>
                    <dd data-quantity="available">
                      {String(e.available)} {e.unit}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {e.devices.length > 0 && (
              <ul className="evidence-devices" aria-label="Referenced devices">
                {e.devices.map((d) => (
                  <li key={JSON.stringify([d.device_type, d.device_id])}>
                    {d.device_type === "ev" ? "EV" : "Flexible equipment"} ·{" "}
                    {d.device_id}
                  </li>
                ))}
              </ul>
            )}
            {e.code === "solver_infeasible" ? (
              <p className="muted">
                No specific analytical certificate is available. No particular
                device, deficit or guaranteed repair has been established.
              </p>
            ) : (
              <details>
                <summary>Calculation context</summary>
                <dl>
                  {(
                    [
                      ["site_limit_kw", "Site limit", "kW"],
                      ["max_power_kw", "Device maximum power", "kW"],
                      [
                        "immutable_fixed_power_kw",
                        "Immutable fixed demand",
                        "kW",
                      ],
                      ["held_flexible_power_kw", "Held flexible demand", "kW"],
                      [
                        "immutable_fixed_energy_kwh",
                        "Immutable fixed energy in window",
                        "kWh",
                      ],
                      [
                        "held_flexible_energy_kwh",
                        "Held flexible energy in window",
                        "kWh",
                      ],
                    ] as const
                  ).map(
                    ([key, label, unit]) =>
                      e.context[key] != null && (
                        <div key={key}>
                          <dt>{label}</dt>
                          <dd>
                            {String(e.context[key])} {unit}
                          </dd>
                        </div>
                      ),
                  )}
                  <div>
                    <dt>Comparison tolerance</dt>
                    <dd>
                      {String(e.context.tolerance)} {e.unit}
                    </dd>
                  </div>
                </dl>
              </details>
            )}
          </article>
        ))}
      </div>
      <details>
        <summary>Original backend reasons</summary>
        {legacy}
      </details>
    </section>
  );
}
