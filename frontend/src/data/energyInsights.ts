import { formatWindow } from './time'
import type { OptimizationResult, Scenario } from '../types/api'

export interface EnergyPeriod {
  hour: number
  demand: number
  price: number
  cost: number
}
export interface DemandInsights {
  periods: EnergyPeriod[]
  highestCost: EnergyPeriod[]
  peak: number
  peakHours: number[]
  cost: number
  headroom: number
  utilization: number
}
const close = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <= tolerance
const vector = (
  values: number[] | null | undefined,
  nonnegative = false,
): values is number[] =>
  Array.isArray(values) &&
  values.length === 24 &&
  values.every(
    (value) => Number.isFinite(value) && (!nonnegative || value >= 0),
  )

// Aggregate demand already includes fixed, EV and flexible demand exactly once.
// Contract: 24 one-hour intervals; signed USD/kWh prices; no demand/fixed charges.
export function deriveEnergyInsights(
  scenario: Scenario | null,
  result: OptimizationResult | null,
) {
  if (
    !scenario ||
    !result ||
    !vector(scenario.electricity_prices_usd_per_kwh) ||
    !Number.isFinite(scenario.building_max_demand_kw) ||
    scenario.building_max_demand_kw <= 0
  )
    return null
  function derive(
    demand: number[] | null,
    reportedCost: number | null,
    reportedPeak: number | null,
  ): DemandInsights | null {
    if (
      !vector(demand, true) ||
      reportedCost === null ||
      reportedPeak === null ||
      !Number.isFinite(reportedCost) ||
      !Number.isFinite(reportedPeak)
    )
      return null
    const periods = demand.map((value, hour) => ({
      hour,
      demand: value,
      price: scenario!.electricity_prices_usd_per_kwh[hour],
      cost: value * scenario!.electricity_prices_usd_per_kwh[hour],
    }))
    const peak = Math.max(...demand)
    const cost = periods.reduce((sum, period) => sum + period.cost, 0)
    // Do not interpret an incomplete/mismatched snapshot as verified insight.
    if (
      !Number.isFinite(cost) ||
      !close(cost, reportedCost, 2e-7) ||
      !close(peak, reportedPeak, 1e-6)
    )
      return null
    return {
      periods,
      highestCost: [...periods]
        .sort((a, b) => b.cost - a.cost || a.hour - b.hour)
        .slice(0, 3),
      peak,
      peakHours: periods
        .filter((p) => close(p.demand, peak, 1e-6))
        .map((p) => p.hour),
      cost,
      headroom: scenario!.building_max_demand_kw - peak,
      utilization: (peak / scenario!.building_max_demand_kw) * 100,
    }
  }
  const baseline = derive(
    result.baseline_demand_kw,
    result.baseline_electricity_cost_usd,
    result.baseline_peak_demand_kw,
  )
  const optimized =
    result.feasibility_status === 'feasible'
      ? derive(
          result.optimized_demand_kw,
          result.optimized_electricity_cost_usd,
          result.optimized_peak_demand_kw,
        )
      : null
  return {
    baseline,
    optimized,
    costReduction:
      baseline && optimized ? baseline.cost - optimized.cost : null,
    peakReduction:
      baseline && optimized ? baseline.peak - optimized.peak : null,
  }
}

export function hourInterval(hour: number) {
  return formatWindow(hour, hour + 1)
}
