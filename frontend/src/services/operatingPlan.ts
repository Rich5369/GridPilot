import type { OperatingPlan, OptimizationResult, Scenario } from "../types/api";
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const series = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 24 && v.every(nonnegative);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
export function validOperatingPlan(
  value: unknown,
  feasibility: unknown,
): boolean {
  if (value == null) return true; // Older aggregate-only responses remain supported.
  if (typeof value !== "object") return false;
  const p = value as OperatingPlan;
  const feasible = feasibility === "feasible";
  if (
    !["ev_only", "joint"].includes(p.scheduling_mode) ||
    !["optimal", "feasible", "infeasible"].includes(p.solver_status) ||
    !["optimal", "feasible", "infeasible", "analytic_infeasibility"].includes(
      p.primary_status,
    ) ||
    !["optimal", "feasible", "unresolved", "not_run"].includes(
      p.peak_tiebreak_status,
    ) ||
    !strings(p.warnings) ||
    !strings(p.baseline_constraint_violations) ||
    !Array.isArray(p.device_schedules)
  )
    return false;
  if (
    feasible
      ? p.verification_status !== "passed" || p.solver_status === "infeasible"
      : p.verification_status !== "unavailable" ||
        p.solver_status !== "infeasible"
  )
    return false;
  if (
    p.solver_status === "optimal"
      ? p.primary_status !== "optimal" || !finite(p.primary_optimum_usd)
      : p.primary_optimum_usd !== null ||
        p.peak_tiebreak_status !== "not_run" ||
        (feasible
          ? p.primary_status !== "feasible"
          : !["infeasible", "analytic_infeasibility"].includes(
              p.primary_status,
            ))
  )
    return false;
  const ids = new Set<string>();
  return p.device_schedules.every((d) => {
    if (
      !d ||
      typeof d !== "object" ||
      typeof d.device_id !== "string" ||
      !d.device_id.trim() ||
      !["ev", "flexible"].includes(d.device_type) ||
      d.scheduling_role !==
        (d.device_type === "flexible" && p.scheduling_mode === "ev_only"
          ? "held_at_baseline"
          : "optimized") ||
      !nonnegative(d.required_energy_kwh) ||
      !finite(d.max_power_kw) ||
      d.max_power_kw <= 0 ||
      !d.available_hours ||
      !Number.isInteger(d.available_hours.start_hour) ||
      !Number.isInteger(d.available_hours.end_hour) ||
      d.available_hours.start_hour < 0 ||
      d.available_hours.end_hour > 24 ||
      d.available_hours.start_hour >= d.available_hours.end_hour ||
      !series(d.baseline_power_kw) ||
      !nonnegative(d.baseline_delivered_energy_kwh) ||
      !near(sum(d.baseline_power_kw), d.baseline_delivered_energy_kwh)
    )
      return false;
    const key = JSON.stringify([d.device_type, d.device_id]);
    if (ids.has(key)) return false;
    ids.add(key);
    if (!feasible)
      return (
        d.optimized_power_kw === null &&
        d.optimized_delivered_energy_kwh === null
      );
    if (
      !series(d.optimized_power_kw) ||
      !nonnegative(d.optimized_delivered_energy_kwh) ||
      !near(sum(d.optimized_power_kw), d.optimized_delivered_energy_kwh) ||
      !near(d.optimized_delivered_energy_kwh, d.required_energy_kwh)
    )
      return false;
    return d.optimized_power_kw.every(
      (kw, h) =>
        kw <= d.max_power_kw + 1e-6 &&
        ((h >= d.available_hours.start_hour &&
          h < d.available_hours.end_hour) ||
          kw <= 1e-6) &&
        (d.scheduling_role !== "held_at_baseline" ||
          near(kw, d.baseline_power_kw[h])),
    );
  });
}
/** Check provenance and reconciliation against this request, never a refreshed solve. */
export function matchesSubmittedPlan(
  r: OptimizationResult,
  s: Scenario,
  mode: "ev_only" | "joint",
): boolean {
  const p = r.operating_plan;
  if (!p) return true;
  if (p.scheduling_mode !== mode) return false;
  const expected = [
    ...s.ev_requirements.map((d) => ({
      id: d.id,
      type: "ev",
      start: d.arrival_hour,
      end: d.deadline_hour,
      energy: d.energy_required_kwh,
      power: d.max_charging_power_kw,
    })),
    ...(s.flexible_equipment ?? []).map((d) => ({
      id: d.id,
      type: "flexible",
      start: d.available_hours.start_hour,
      end: d.available_hours.end_hour,
      energy: d.energy_required_kwh,
      power: d.max_power_kw,
    })),
  ];
  if (
    expected.length !== p.device_schedules.length ||
    !expected.every((d, i) => {
      const actual = p.device_schedules[i];
      return (
        d.id === actual.device_id &&
        d.type === actual.device_type &&
        d.start === actual.available_hours.start_hour &&
        d.end === actual.available_hours.end_hour &&
        d.energy === actual.required_energy_kwh &&
        d.power === actual.max_power_kw
      );
    })
  )
    return false;
  return (["baseline", "optimized"] as const).every((kind) => {
    const aggregate = r[`${kind}_demand_kw`];
    if (aggregate === null) return true;
    const total = s.fixed_demand_kw.map(
      (kw, h) =>
        kw +
        p.device_schedules.reduce(
          (v, d) => v + (d[`${kind}_power_kw`]?.[h] ?? NaN),
          0,
        ),
    );
    const cost = total.reduce(
      (v, kw, h) => v + kw * s.electricity_prices_usd_per_kwh[h],
      0,
    );
    return (
      total.every(
        (kw, h) =>
          near(kw, aggregate[h]) &&
          (kind !== "optimized" || kw <= s.building_max_demand_kw + 1e-6),
      ) &&
      near(sum(total), sum(aggregate)) &&
      near(Math.max(...total), r[`${kind}_peak_demand_kw`]!) &&
      Math.abs(cost - r[`${kind}_electricity_cost_usd`]!) <= 2e-7
    );
  });
}
