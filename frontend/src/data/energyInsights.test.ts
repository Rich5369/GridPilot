import { expect, it } from 'vitest'
import { deriveEnergyInsights, hourInterval } from './energyInsights'
import type { OptimizationResult, Scenario } from '../types/api'
const scenario: Scenario = {
  operating_hours: { start_hour: 0, end_hour: 24 },
  fixed_demand_kw: Array(24).fill(1),
  electricity_prices_usd_per_kwh: Array.from({ length: 24 }, (_, h) =>
    h === 2 ? 1 : 0.1,
  ),
  building_max_demand_kw: 10,
  ev_requirements: [],
}
function result(
  baseline = Array(24).fill(1),
  optimized: number[] | null = Array(24).fill(1),
  prices = scenario.electricity_prices_usd_per_kwh,
): OptimizationResult {
  const cost = (a: number[]) => a.reduce((s, v, h) => s + v * prices[h], 0)
  return {
    feasibility_status: optimized ? 'feasible' : 'infeasible',
    baseline_demand_kw: baseline,
    optimized_demand_kw: optimized,
    baseline_peak_demand_kw: Math.max(...baseline),
    optimized_peak_demand_kw: optimized ? Math.max(...optimized) : null,
    baseline_electricity_cost_usd: cost(baseline),
    optimized_electricity_cost_usd: optimized ? cost(optimized) : null,
    constraint_violations: optimized ? [] : ['Reported infeasible'],
  }
}
it('ranks expenditure rather than price and counts aggregate end uses once', () => {
  const demand = Array(24).fill(1)
  demand[7] = 20
  const data = deriveEnergyInsights(scenario, result(demand, demand))!
  expect(data.optimized!.highestCost.map((p) => p.hour)).toEqual([7, 2, 0])
  expect(data.optimized!.highestCost[0]).toEqual({
    hour: 7,
    demand: 20,
    price: 0.1,
    cost: 2,
  })
  expect(data.optimized!.cost).toBeCloseTo(5.2, 12)
  expect(data.optimized!.headroom).toBe(-10)
  expect(data.optimized!.utilization).toBe(200)
})
it('identifies tied peaks, capacity margin and a higher-peak lower-cost tradeoff', () => {
  const baseline = Array(24).fill(0)
  baseline[2] = 4
  const optimized = Array(24).fill(0)
  optimized[7] = 6
  optimized[8] = 6
  const data = deriveEnergyInsights(scenario, result(baseline, optimized))!
  expect(data.optimized!.peakHours).toEqual([7, 8])
  expect(data.optimized!.headroom).toBe(4)
  expect(data.optimized!.utilization).toBe(60)
  expect(data.costReduction).toBeCloseTo(2.8)
  expect(data.peakReduction).toBe(-2)
})
it('handles zero demand, ties and negative prices', () => {
  const prices = Array(24).fill(-0.1)
  const data = deriveEnergyInsights(
    { ...scenario, electricity_prices_usd_per_kwh: prices },
    result(Array(24).fill(1), Array(24).fill(0), prices),
  )!
  expect(data.baseline!.cost).toBeCloseTo(-2.4)
  expect(data.optimized!.peakHours).toHaveLength(24)
  expect(data.optimized!.highestCost.map((p) => p.hour)).toEqual([0, 1, 2])
  expect(data.costReduction).toBeCloseTo(-2.4)
  expect(hourInterval(23)).toBe('11:00 PM–12:00 AM — end of day (end excluded)')
})
it('retains baseline on infeasibility without optimized claims', () => {
  const data = deriveEnergyInsights(scenario, result(undefined, null))!
  expect(data.baseline).not.toBeNull()
  expect(data.optimized).toBeNull()
  expect(data.costReduction).toBeNull()
  expect(data.peakReduction).toBeNull()
})
it('rejects missing, incomplete, nonfinite and mismatched snapshots independently', () => {
  expect(deriveEnergyInsights(null, result())).toBeNull()
  expect(deriveEnergyInsights(scenario, null)).toBeNull()
  expect(
    deriveEnergyInsights(
      { ...scenario, electricity_prices_usd_per_kwh: [1] },
      result(),
    ),
  ).toBeNull()
  expect(
    deriveEnergyInsights({ ...scenario, building_max_demand_kw: 0 }, result()),
  ).toBeNull()
  for (const demand of [[1], Array(24).fill(NaN), Array(24).fill(-1)])
    expect(
      deriveEnergyInsights(scenario, {
        ...result(),
        optimized_demand_kw: demand,
      })!.optimized,
    ).toBeNull()
  expect(
    deriveEnergyInsights(scenario, {
      ...result(),
      optimized_electricity_cost_usd: 100,
    })!.optimized,
  ).toBeNull()
  expect(
    deriveEnergyInsights(scenario, { ...result(), baseline_peak_demand_kw: 2 })!
      .baseline,
  ).toBeNull()
})
