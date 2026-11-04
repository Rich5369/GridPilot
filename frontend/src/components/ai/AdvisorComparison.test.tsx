// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { EnergyAssistant } from './EnergyAssistant'
import { AdvisorComparisonCard } from './AdvisorComparisonCard'
import { defaultEditor, toScenario } from '../../data/demoScenario'
import { apiRequest } from '../../services/api'
import { compareWithAdvisor, type AdvisorComparison } from '../../services/advisorComparison'
import fixture from '../../testFixtures/advisorComparison.json'

vi.mock('../../services/api', async original => ({ ...await original<typeof import('../../services/api')>(), apiRequest: vi.fn() }))
vi.mock('../../services/advisorComparison', async original => ({ ...await original<typeof import('../../services/advisorComparison')>(), compareWithAdvisor: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function setup() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const change = vi.fn()
  const render = (limit = defaultEditor.limit) => act(async () => root.render(
    <EnergyAssistant editor={{ ...defaultEditor, limit }} onChange={change} resultScenario={null} />))
  const click = (label: string) => act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === label)!.click())
  const clean = async () => { await act(async () => root.unmount()); container.remove() }
  vi.mocked(apiRequest).mockReset().mockResolvedValue({
    source: 'meta', category: 'scenario_proposal', message: 'Review the proposed site limit.', profile: {},
    changes: { building_max_demand_kw: 15 }, proposed_scenario: toScenario({ ...defaultEditor, limit: '15' }),
  })
  vi.mocked(compareWithAdvisor).mockReset()
  return { container, root, change, render, click, clean }
}

it('runs a comparison only after review and keeps apply separate from solving', async () => {
  const s = setup()
  const comparison = structuredClone(fixture.response) as AdvisorComparison
  vi.mocked(compareWithAdvisor).mockResolvedValue(comparison)
  try {
    await s.render()
    await s.click('Keep peak power demand below 15 kW.')
    await s.click('Send to advisor')
    expect(compareWithAdvisor).not.toHaveBeenCalled()
    expect(s.change).not.toHaveBeenCalled()
    await s.click('Compare with Meta')
    expect(compareWithAdvisor).toHaveBeenCalledExactlyOnceWith(toScenario(defaultEditor),
      { building_max_demand_kw: 15 }, toScenario({ ...defaultEditor, limit: '15' }), 'ev_only', expect.any(AbortSignal))
    expect(s.change).not.toHaveBeenCalled()
    expect(s.container.textContent).toContain('Meta requested comparison tool')
    expect(s.container.textContent).toContain('more per day')
    expect(s.container.querySelector('table')).not.toBeNull()
    await s.click('Apply Changes')
    expect(s.change).toHaveBeenCalledExactlyOnceWith({ ...defaultEditor, limit: '15' })
  } finally { await s.clean() }
})

it('passes exact comparison result handles to follow-ups', async () => {
  const s = setup()
  vi.mocked(compareWithAdvisor).mockResolvedValue(fixture.response as AdvisorComparison)
  try {
    await s.render()
    await s.click('Keep peak power demand below 15 kW.')
    await s.click('Send to advisor')
    await s.click('Compare with Meta')
    vi.mocked(apiRequest).mockResolvedValue({ source: 'meta', category: 'answer', message: 'Review operating flexibility.', profile: {}, changes: {}, proposed_scenario: null })
    await s.click('Send to advisor')
    const body = JSON.parse(vi.mocked(apiRequest).mock.calls.at(-1)![1]!.body as string)
    expect(body.result_id).toBe(fixture.response.current.result_id)
    expect(body.comparison).toEqual({ changes: fixture.response.changes, alternative_result_id: fixture.response.alternative.result_id })
    expect(s.container.querySelector('[aria-label="Verified scenario comparison"]')).not.toBeNull()
  } finally { await s.clean() }
})

it('blocks duplicate comparison clicks and discards results after draft edits', async () => {
  const s = setup()
  let resolve!: (value: AdvisorComparison) => void
  vi.mocked(compareWithAdvisor).mockImplementation(() => new Promise(r => { resolve = r }))
  try {
    await s.render()
    await s.click('Keep peak power demand below 15 kW.')
    await s.click('Send to advisor')
    await s.click('Compare with Meta')
    await s.click('Compare with Meta')
    expect(compareWithAdvisor).toHaveBeenCalledTimes(1)
    await s.render('30')
    await act(async () => resolve(fixture.response as AdvisorComparison))
    expect(s.container.textContent).toContain('Setup changed during comparison')
    expect(s.container.querySelector('table')).toBeNull()
    expect(s.change).not.toHaveBeenCalled()
  } finally { await s.clean() }
})

it('keeps the reviewed proposal and inputs after failure with no automatic retry', async () => {
  const s = setup()
  vi.mocked(compareWithAdvisor).mockRejectedValue(new TypeError('Network unavailable'))
  try {
    await s.render()
    await s.click('Keep peak power demand below 15 kW.')
    await s.click('Send to advisor')
    await s.click('Compare with Meta')
    expect(s.container.textContent).toContain('Network unavailable')
    expect(s.container.querySelector('textarea')!.value).toContain('15 kW')
    expect(s.container.querySelector('[aria-label="Proposed scenario changes"]')).not.toBeNull()
    expect(compareWithAdvisor).toHaveBeenCalledTimes(1)
    expect(s.change).not.toHaveBeenCalled()
  } finally { await s.clean() }
})

it('shows infeasibility as unavailable cost and peak rather than zero', async () => {
  const container = document.createElement('div'), root = createRoot(container)
  const response = structuredClone(fixture.response) as AdvisorComparison
  Object.assign(response.alternative, { feasibility_status: 'infeasible', optimized_electricity_cost_usd: null, optimized_peak_demand_kw: null, optimized_demand_kw: null, constraint_violations: ['Site limit cannot support fixed demand.'], operating_plan: null })
  response.daily_cost_difference_usd = null
  response.peak_difference_kw = null
  try {
    await act(async () => root.render(<AdvisorComparisonCard comparison={response} stale={false} />))
    const rows = container.querySelectorAll('tbody tr')
    expect(rows[0].lastElementChild!.textContent).toBe('No')
    expect(rows[1].lastElementChild!.textContent).toBe('Unavailable')
    expect(rows[2].lastElementChild!.textContent).toBe('Unavailable')
    expect(container.textContent).toContain('Site limit cannot support fixed demand.')
  } finally { await act(async () => root.unmount()) }
})
