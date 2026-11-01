import { expect, it } from 'vitest'
import example from './examplePlan.json'
import { defaultEditor, toScenario } from './demoScenario'
import { isOptimizationResult } from '../services/api'
import { matchesSubmittedPlan } from '../services/operatingPlan'
import type { OptimizationResult } from '../types/api'
it('keeps the offline example consistent with its editable inputs, aggregate, devices and quality', () => {
  expect(example.scenario).toEqual(toScenario(defaultEditor))
  expect(isOptimizationResult(example.result)).toBe(true)
  expect(matchesSubmittedPlan(example.result as OptimizationResult, example.scenario, 'joint')).toBe(true)
  expect(example.result.operating_plan.verification_status).toBe('passed')
  expect(example.result).not.toHaveProperty('result_id')
  const cost = example.result.optimized_demand_kw.reduce((sum, value, hour) => sum + value * example.scenario.electricity_prices_usd_per_kwh[hour], 0)
  expect(cost).toBeCloseTo(example.result.optimized_electricity_cost_usd, 7)
})
