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
export interface OptimizationResult {
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
