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
  expect(fetch.mock.calls[0][0]).toBe('http://localhost:8000/api/optimize?scheduling_mode=ev_only')
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

it('uses a longer optimization deadline and keeps health requests short', async () => {
  const { getHealth, OPTIMIZATION_TIMEOUT_MS } = await import('./api')
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(valid)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', project: 'GridPilot' }))))
  await optimizeScenario(demoScenario)
  await getHealth()
  expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([OPTIMIZATION_TIMEOUT_MS, 5000])
  timeout.mockRestore()
})
it('bounds optimization timeout configuration and falls back safely', async () => {
  const { optimizationTimeoutMs } = await import('./api')
  expect(optimizationTimeoutMs('60000')).toBe(60000)
  for (const value of [undefined, '', 'NaN', '-1', '0', '999', '120001', 'Infinity', '3000.5'])
    expect(optimizationTimeoutMs(value)).toBe(45000)
})
it('explains timeout without claiming the server stopped', () => {
  const message = optimizationError(new DOMException('expired', 'TimeoutError'))
  expect(message).toContain('timed out after 45 seconds')
  expect(message).toContain('server may still be processing')
})
it.each([422, 503, 500])('preserves HTTP %s failures without accepting results', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'failure', message: 'private' } }), { status })))
  try {
    await optimizeScenario(demoScenario)
    expect.unreachable()
  } catch (error) {
    expect(optimizationError(error)).toContain(`HTTP ${status}`)
    expect(optimizationError(error)).not.toContain('private')
  }
})
it('aborts a pending optimization when its configured deadline expires', async () => {
  vi.useFakeTimers()
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(new DOMException('expired', 'TimeoutError')), ms)
    return controller.signal
  })
  vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
  })))
  try {
    const request = expect(optimizeScenario(demoScenario)).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(45000)
    await request
  } finally {
    timeout.mockRestore()
    vi.useRealTimers()
  }
})

it('submits joint mode explicitly without changing the scenario body', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid)))
  vi.stubGlobal('fetch', fetch)
  await optimizeScenario(demoScenario, 'joint')
  expect(fetch.mock.calls[0][0]).toContain('/api/optimize?scheduling_mode=joint')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(demoScenario)
})
