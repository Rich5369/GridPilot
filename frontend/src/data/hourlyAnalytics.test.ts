import { expect, it } from 'vitest'
import { hourlyAnalytics } from './hourlyAnalytics'
import { intervalRows } from './demandChart'
import type { Scenario, OptimizationResult } from '../types/api'
const scenario: Scenario = {
  electricity_prices_usd_per_kwh: Array.from({ length: 24 }, (_, h) =>
    h < 12 ? -0.05 : 0.2,
  ),
  fixed_demand_kw: Array(24).fill(2),
  building_max_demand_kw: 10,
  operating_hours: { start_hour: 0, end_hour: 24 },
  ev_requirements: [],
}
const result: OptimizationResult = {
  baseline_demand_kw: Array(24).fill(4),
  optimized_demand_kw: Array(24).fill(3),
  baseline_electricity_cost_usd: 7.2,
  optimized_electricity_cost_usd: 5.4,
  baseline_peak_demand_kw: 4,
  optimized_peak_demand_kw: 3,
  feasibility_status: 'feasible',
  constraint_violations: [],
}
it('reconciles 24 signed hourly charges and differences to solver totals without including the closing sample', () => {
  const profiles = hourlyAnalytics(result, scenario)
  expect(profiles.baseline?.[0]).toBe(-0.2)
  expect(profiles.optimized?.[12]).toBeCloseTo(0.6)
  expect(profiles.baseline?.reduce((a, b) => a + b, 0)).toBeCloseTo(7.2)
  expect(profiles.optimized?.reduce((a, b) => a + b, 0)).toBeCloseTo(5.4)
  expect(profiles.difference?.reduce((a, b) => a + b, 0)).toBeCloseTo(1.8)
  expect(profiles.headroom).toEqual(Array(24).fill(7))
  const rows = intervalRows([
    { key: 'baseline', label: 'Baseline', values: profiles.baseline! },
  ])
  expect(rows).toHaveLength(25)
  expect(rows[24]).toEqual({ hour: 24, baseline: profiles.baseline![23] })
})
it('uses the submitted tariff snapshot and refuses mismatched or missing hourly data', () => {
  expect(
    hourlyAnalytics(result, {
      ...scenario,
      electricity_prices_usd_per_kwh: Array(24).fill(1),
    }).optimized,
  ).toBeNull()
  expect(hourlyAnalytics(result, null).difference).toBeNull()
  expect(
    hourlyAnalytics({ ...result, baseline_demand_kw: [4] }, scenario).baseline,
  ).toBeNull()
  expect(
    hourlyAnalytics(result, {
      ...scenario,
      electricity_prices_usd_per_kwh: Array(24).fill(NaN),
    }).baseline,
  ).toBeNull()
})
it('retains baseline evidence without inventing an infeasible optimized profile', () => {
  const profiles = hourlyAnalytics(
    {
      ...result,
      feasibility_status: 'infeasible',
      optimized_demand_kw: null,
      optimized_electricity_cost_usd: null,
      optimized_peak_demand_kw: null,
    },
    scenario,
  )
  expect(profiles.baseline).toHaveLength(24)
  expect(profiles.optimized).toBeNull()
  expect(profiles.difference).toBeNull()
  expect(profiles.headroom).toBeNull()
})
