import type {
  InfeasibilityEvidence,
  OptimizationResult,
  Scenario,
} from "../types/api";
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const codes = [
  "device_window_capacity",
  "fixed_demand_above_site_limit",
  "shared_window_capacity",
  "solver_infeasible",
];
const quantities = [
  "site_limit_kw",
  "max_power_kw",
  "immutable_fixed_power_kw",
  "held_flexible_power_kw",
  "immutable_fixed_energy_kwh",
  "held_flexible_energy_kwh",
] as const;
export function validEvidence(
  value: unknown,
  status: unknown,
  primary?: string,
): boolean {
  if (value == null) return true;
  if (!Array.isArray(value) || (status === "feasible" && value.length > 0))
    return false;
  return value.every((item) => {
    if (
      !object(item) ||
      !(typeof item.code === "string" && codes.includes(item.code)) ||
      typeof item.message !== "string" ||
      !item.message.trim() ||
      !Array.isArray(item.devices) ||
      !object(item.context)
    )
      return false;
    const c = item.context;
    if (
      !(
        typeof c.scheduling_mode === "string" &&
        ["ev_only", "joint"].includes(c.scheduling_mode)
      ) ||
      !quantities.every((k) => c[k] == null || nonnegative(c[k]))
    )
      return false;
    const ids = new Set<string>();
    for (const d of item.devices) {
      if (
        !object(d) ||
        !(
          typeof d.device_type === "string" &&
          ["ev", "flexible"].includes(d.device_type)
        ) ||
        typeof d.device_id !== "string" ||
        !d.device_id.length
      )
        return false;
      const key = JSON.stringify([d.device_type, d.device_id]);
      if (ids.has(key)) return false;
      ids.add(key);
    }
    if (item.code === "solver_infeasible")
      return (
        item.proof_source === "solver_infeasible" &&
        item.devices.length === 0 &&
        item.window === null &&
        item.required === null &&
        item.available === null &&
        item.unit === null &&
        c.tolerance === null &&
        quantities.every((k) => c[k] == null) &&
        (!primary || primary === "infeasible")
      );
    if (
      item.proof_source !== "analytical_necessary_condition" ||
      (primary && primary !== "analytic_infeasibility") ||
      !nonnegative(item.required) ||
      !nonnegative(item.available) ||
      !nonnegative(c.tolerance) ||
      item.required <= item.available + c.tolerance ||
      !object(item.window)
    )
      return false;
    const { start_hour: start, end_hour: end } = item.window;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      Number(start) < 0 ||
      Number(end) > 24 ||
      Number(start) >= Number(end)
    )
      return false;
    if (item.code === "fixed_demand_above_site_limit")
      return (
        item.unit === "kW" &&
        Number(end) === Number(start) + 1 &&
        nonnegative(c.site_limit_kw) &&
        c.site_limit_kw > 0
      );
    return (
      item.unit === "kWh" &&
      item.devices.length > 0 &&
      (item.code === "device_window_capacity"
        ? item.devices.length === 1 &&
          nonnegative(c.max_power_kw) &&
          c.max_power_kw > 0
        : nonnegative(c.site_limit_kw) && c.site_limit_kw > 0)
    );
  });
}
export function matchesEvidence(
  result: OptimizationResult,
  scenario: Scenario,
  mode: "ev_only" | "joint",
): boolean {
  if (!result.infeasibility_evidence) return true;
  const devices = new Map([
    ...scenario.ev_requirements.map(
      (d) =>
        [
          JSON.stringify(["ev", d.id]),
          {
            start: d.arrival_hour,
            end: d.deadline_hour,
            energy: d.energy_required_kwh,
            power: d.max_charging_power_kw,
          },
        ] as const,
    ),
    ...(scenario.flexible_equipment ?? []).map(
      (d) =>
        [
          JSON.stringify(["flexible", d.id]),
          {
            start: d.available_hours.start_hour,
            end: d.available_hours.end_hour,
            energy: d.energy_required_kwh,
            power: d.max_power_kw,
          },
        ] as const,
    ),
  ]);
  return result.infeasibility_evidence.every((e) => {
    if (
      e.context.scheduling_mode !== mode ||
      (e.context.site_limit_kw != null &&
        e.context.site_limit_kw !== scenario.building_max_demand_kw)
    )
      return false;
    const items = e.devices.map((d) =>
      devices.get(JSON.stringify([d.device_type, d.device_id])),
    );
    if (items.some((d) => !d)) return false;
    if (e.code === "device_window_capacity") {
      const d = items[0]!;
      return (
        e.window?.start_hour === d.start &&
        e.window.end_hour === d.end &&
        e.required === d.energy &&
        e.context.max_power_kw === d.power
      );
    }
    if (e.code === "fixed_demand_above_site_limit")
      return (
        e.available === scenario.building_max_demand_kw &&
        (e.context.immutable_fixed_power_kw == null ||
          e.context.immutable_fixed_power_kw ===
            scenario.fixed_demand_kw[e.window!.start_hour]) &&
        e.devices.every(
          (d) => mode === "ev_only" && d.device_type === "flexible",
        )
      );
    if (e.code === "shared_window_capacity")
      return (
        items.every(
          (d) =>
            d!.start >= e.window!.start_hour && d!.end <= e.window!.end_hour,
        ) &&
        e.devices.every((d) => mode === "joint" || d.device_type === "ev") &&
        Math.abs(items.reduce((s, d) => s + d!.energy, 0) - e.required!) <= 1e-6
      );
    return true;
  });
}
export const evidenceTitles: Record<InfeasibilityEvidence["code"], string> = {
  device_window_capacity: "Device window capacity",
  fixed_demand_above_site_limit: "Fixed demand above site limit",
  shared_window_capacity: "Shared-window capacity",
  solver_infeasible: "Solver-proven infeasibility",
};
