import { afterEach, expect, it, vi } from 'vitest'
import { demoScenario } from '../data/demoScenario'
import {
  isOptimizationResult,
  optimizationError,
  optimizeScenario,
} from './api'
const valid = {
  feasibility_status: 'feasible',
  baseline_electricity_cost_usd: 20,
  optimized_electricity_cost_usd: 18,
  baseline_peak_demand_kw: 3,
  optimized_peak_demand_kw: 2,
  baseline_demand_kw: Array(24).fill(3),
  optimized_demand_kw: Array(24).fill(2),
  constraint_violations: [],
}
afterEach(() => vi.unstubAllGlobals())
it('posts the existing scenario contract and accepts a complete solver response', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)))
  vi.stubGlobal('fetch', fetch)
  expect(await optimizeScenario(demoScenario)).toEqual(valid)
  expect(fetch.mock.calls[0][0]).toBe('http://localhost:8000/api/optimize')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(demoScenario)
})
it.each([501, 200])(
  'does not accept a placeholder with HTTP %s as a solver result',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: 'not_implemented' }), {
            status,
          }),
        ),
    )
    await expect(optimizeScenario(demoScenario)).rejects.toThrow()
  },
)
it('explains unavailable backend without creating a result', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
  )
  try {
    await optimizeScenario(demoScenario)
    expect.unreachable()
  } catch (error) {
    expect(optimizationError(error)).toContain('unavailable')
  }
})
it('rejects incomplete, nonfinite, negative, or inconsistent response shapes', () => {
  expect(isOptimizationResult(valid)).toBe(true)
  for (const patch of [
    { optimized_demand_kw: null },
    { baseline_demand_kw: [1] },
    { optimized_peak_demand_kw: -1 },
    { baseline_electricity_cost_usd: Infinity },
    { constraint_violations: ['failure'] },
    { feasibility_status: 'unknown' },
  ])
    expect(isOptimizationResult({ ...valid, ...patch })).toBe(false)
  expect(
    isOptimizationResult({
      ...valid,
      feasibility_status: 'infeasible',
      optimized_demand_kw: null,
      optimized_peak_demand_kw: null,
      optimized_electricity_cost_usd: null,
      constraint_violations: ['Capacity exceeded'],
    }),
  ).toBe(true)
})
