import type { OptimizationResult, Scenario } from '../types/api'

const hourly = (values: number[] | null | undefined): values is number[] =>
  values?.length === 24 && values.every(Number.isFinite)

/** Display derivation only. One-hour average kW × 1 h × USD/kWh = USD. */
export function hourlyAnalytics(
  result: OptimizationResult | null,
  scenario: Scenario | null,
) {
  const prices = scenario?.electricity_prices_usd_per_kwh
  function costs(
    demand: number[] | null | undefined,
    total: number | null | undefined,
  ) {
    if (
      !hourly(demand) ||
      !hourly(prices) ||
      total == null ||
      !Number.isFinite(total)
    )
      return null
    const values = demand.map((kw, hour) => kw * prices[hour])
    const sum = values.reduce((a, b) => a + b, 0)
    // Never turn an aggregate-only or mismatched snapshot into a purported hourly series.
    return Math.abs(sum - total) <= 1e-5 ? values : null
  }
  const baseline = costs(
    result?.baseline_demand_kw,
    result?.baseline_electricity_cost_usd,
  )
  const optimized = costs(
    result?.optimized_demand_kw,
    result?.optimized_electricity_cost_usd,
  )
  return {
    baseline,
    optimized,
    difference:
      baseline && optimized ? baseline.map((v, h) => v - optimized[h]) : null,
    headroom:
      scenario &&
      Number.isFinite(scenario.building_max_demand_kw) &&
      hourly(result?.optimized_demand_kw)
        ? result.optimized_demand_kw.map(
            (v) => scenario.building_max_demand_kw - v,
          )
        : null,
  }
}
