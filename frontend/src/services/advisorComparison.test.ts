import { afterEach, expect, it, vi } from 'vitest'
import fixture from '../testFixtures/advisorComparison.json'
import { compareWithAdvisor, type AdvisorComparison } from './advisorComparison'
import type { Scenario } from '../types/api'

const scenario = fixture.scenario as Scenario
const response = fixture.response as AdvisorComparison
const run = () => compareWithAdvisor(scenario, response.changes, response.proposed_scenario, 'ev_only', new AbortController().signal)
function serve(value: unknown) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

it('posts reviewed inputs once and reconciles both real solver plans', async () => {
  const fetch = serve(response)
  expect(await run()).toEqual(response)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('http://localhost:8000/api/ai/compare')
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ scenario, changes: response.changes, scheduling_mode: 'ev_only' })
  expect(response.daily_cost_difference_usd).toBeLessThan(0)
})

it.each(['scenario', 'mode', 'cost', 'difference', 'device', 'changes', 'source', 'result ID', 'plan'])('rejects mismatched %s evidence', async kind => {
  const bad = structuredClone(response)
  if (kind === 'scenario') bad.proposed_scenario.building_max_demand_kw = 99
  if (kind === 'mode') bad.scheduling_mode = 'joint'
  if (kind === 'cost') bad.alternative.optimized_electricity_cost_usd = 0
  if (kind === 'difference') bad.daily_cost_difference_usd = 999
  if (kind === 'device') bad.alternative.operating_plan!.device_schedules[0].device_id = 'unrelated'
  if (kind === 'changes') bad.changes.building_max_demand_kw = 99
  if (kind === 'source') Object.assign(bad, { source: 'mock' })
  if (kind === 'result ID') bad.alternative.result_id = bad.current.result_id
  if (kind === 'plan') bad.alternative.operating_plan = null
  serve(bad)
  await expect(run()).rejects.toThrow()
})

it('retains verified results when the Meta explanation is unavailable', async () => {
  const fallback = { ...response, explanation_source: 'unavailable', message: 'Review the verified comparison below.' }
  serve(fallback)
  expect((await run()).explanation_source).toBe('unavailable')
})

it('does not retry failed requests', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('Network unavailable'))
  vi.stubGlobal('fetch', fetch)
  await expect(run()).rejects.toThrow('Network unavailable')
  expect(fetch).toHaveBeenCalledTimes(1)
})
