/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { getHealth, optimizeScenario } from './api'
import type { Scenario } from '../types/api'

// Opt-in: start uvicorn, then set GRIDPILOT_LIVE_API=1 to exercise real HTTP.
it.skipIf(process.env.GRIDPILOT_LIVE_API !== '1')('consumes real feasible and infeasible FastAPI optimization results', async () => {
  expect(await getHealth()).toEqual({ status: 'ok', project: 'GridPilot' })
  const scenario: Scenario = JSON.parse(readFileSync(new URL('../../../sample_data/scenario.demo.json', import.meta.url), 'utf8'))
  const result = await optimizeScenario(scenario)
  expect(result.feasibility_status).toBe('feasible')
  expect(result.optimized_electricity_cost_usd).toBeCloseTo(80.64, 5)
  expect(result.baseline_demand_kw).toHaveLength(24)
  expect(result.optimized_demand_kw).toHaveLength(24)
  expect(result.constraint_violations).toEqual([])
  const infeasible = await optimizeScenario({ ...scenario, fixed_demand_kw: Array(24).fill(101) })
  expect(infeasible.feasibility_status).toBe('infeasible')
  expect(infeasible.baseline_demand_kw).toHaveLength(24)
  expect(infeasible.optimized_demand_kw).toBeNull()
  expect(infeasible.optimized_electricity_cost_usd).toBeNull()
  expect(infeasible.optimized_peak_demand_kw).toBeNull()
  expect(infeasible.constraint_violations.length).toBeGreaterThan(0)
})

it.skipIf(process.env.GRIDPILOT_LIVE_API !== '1')('derives deterministic insights from real EV and joint HTTP snapshots', async () => {
  const { deriveEnergyInsights } = await import('../data/energyInsights')
  const scenario: Scenario = JSON.parse(readFileSync(new URL('../../../sample_data/scenario.demo.json', import.meta.url), 'utf8'))
  for (const mode of ['ev_only', 'joint'] as const) {
    const result = await optimizeScenario(scenario, mode)
    const insights = deriveEnergyInsights(scenario, result)!
    expect(insights.baseline).not.toBeNull()
    expect(insights.optimized).not.toBeNull()
    expect(insights.optimized!.cost).toBeCloseTo(result.optimized_electricity_cost_usd!, 7)
    expect(insights.optimized!.peak).toBeCloseTo(result.optimized_peak_demand_kw!, 6)
    const ranked = result.optimized_demand_kw!.map((kw, hour) => ({ hour, cost: kw * scenario.electricity_prices_usd_per_kwh[hour] })).sort((a, b) => b.cost - a.cost || a.hour - b.hour)
    expect(insights.optimized!.highestCost.map(p => p.hour)).toEqual(ranked.slice(0, 3).map(p => p.hour))
    const impossibleScenario = { ...scenario, fixed_demand_kw: Array(24).fill(101) }
    const impossible = await optimizeScenario(impossibleScenario, mode)
    const unavailable = deriveEnergyInsights(impossibleScenario, impossible)!
    expect(unavailable.optimized).toBeNull()
    expect(unavailable.costReduction).toBeNull()
  }
})
