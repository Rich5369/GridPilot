// Keep aligned with backend/models/contracts.py and docs/contracts.md.
export interface HealthResponse { status: 'ok'; project: 'GridPilot' }
export interface HourWindow { start_hour: number; end_hour: number }
export interface EVRequirement {
  id: string
  arrival_hour: number
  deadline_hour: number
  energy_required_kwh: number
  max_charging_power_kw: number
}
export interface FlexibleEquipment {
  id: string
  available_hours: HourWindow
  energy_required_kwh: number
  max_power_kw: number
}
export interface Scenario {
  operating_hours: HourWindow
  fixed_demand_kw: number[] // Exactly 24 one-hour intervals; validated by the API.
  electricity_prices_usd_per_kwh: number[]
  building_max_demand_kw: number
  ev_requirements: EVRequirement[]
  flexible_equipment?: FlexibleEquipment[]
}
export interface DeviceSchedule {
  device_id: string
  device_type: 'ev' | 'flexible'
  scheduling_role: 'optimized' | 'held_at_baseline'
  required_energy_kwh: number
  available_hours: HourWindow
  max_power_kw: number
  baseline_power_kw: number[]
  baseline_delivered_energy_kwh: number
  optimized_power_kw: number[] | null
  optimized_delivered_energy_kwh: number | null
}
export interface OperatingPlan {
  scheduling_mode: 'ev_only' | 'joint'
  solver_status: 'optimal' | 'feasible' | 'infeasible'
  primary_status: 'optimal' | 'feasible' | 'infeasible' | 'analytic_infeasibility'
  peak_tiebreak_status: 'optimal' | 'feasible' | 'unresolved' | 'not_run'
  primary_optimum_usd: number | null
  verification_status: 'passed' | 'unavailable'
  warnings: string[]
  baseline_constraint_violations: string[]
  device_schedules: DeviceSchedule[]
}
export interface OptimizationResult {
  infeasibility_evidence?: InfeasibilityEvidence[] | null
  result_id?: string | null
  operating_plan?: OperatingPlan | null
  feasibility_status: 'feasible' | 'infeasible'
  baseline_electricity_cost_usd: number
  optimized_electricity_cost_usd: number | null
  baseline_peak_demand_kw: number
  optimized_peak_demand_kw: number | null
  baseline_demand_kw: number[]
  optimized_demand_kw: number[] | null
  constraint_violations: string[]
}
export interface NotImplementedResponse { status: 'not_implemented'; message: string }

// Existing E2 backend contract; quantities are supplied by the verified outcome.
export interface InfeasibilityEvidence {
  code: 'device_window_capacity' | 'fixed_demand_above_site_limit' | 'shared_window_capacity' | 'solver_infeasible'
  message: string
  proof_source: 'analytical_necessary_condition' | 'solver_infeasible'
  devices: {device_type:'ev'|'flexible';device_id:string}[]
  window: HourWindow | null
  required: number | null
  available: number | null
  unit: 'kW' | 'kWh' | null
  context: {
    scheduling_mode:'ev_only'|'joint'
    tolerance:number|null
    site_limit_kw?:number|null
    max_power_kw?:number|null
    immutable_fixed_power_kw?:number|null
    held_flexible_power_kw?:number|null
    immutable_fixed_energy_kwh?:number|null
    held_flexible_energy_kwh?:number|null
  }
}
