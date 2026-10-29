// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
import { defaultEditor, toScenario } from '../data/demoScenario'
vi.mock('../components/EnergyChart', () => ({
  EnergyChart: () => <div>24-hour chart</div>,
}))
vi.mock('../components/dashboard/Comparison', () => ({
  Comparison: ({ result }: { result: unknown }) => (
    <div>{result ? 'Backend result' : 'No optimization result yet'}</div>
  ),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn()
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', project: 'GridPilot' })),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
async function click(label: string) {
  const b = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )!
  expect(b).toBeTruthy()
  await act(async () => b.click())
}
async function input(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('edits, validates and resets the draft without changing demo results', async () => {
  await act(async () => root.render(<Dashboard />))
  expect(container.textContent).toContain('128.8')
  await click('Scenario configuration')
  await input('limit', '12')
  expect(container.textContent).toContain('12 kW limit')
  await input('deadline', '6')
  expect(
    container.querySelector('#deadline')!.getAttribute('aria-invalid'),
  ).toBe('true')
  expect(
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Run optimization',
    )!.disabled,
  ).toBe(true)
  await click('Reset to Default Scenario')
  expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe('25')
  await input('limit', '15')
  await click('Energy overview')
  expect(container.textContent).toContain('128.8')
  expect(container.textContent).toContain(
    'Charts and costs retain the original fixture',
  )
})
it('displays HTTP 501 clearly and never claims solver success', async () => {
  await act(async () => root.render(<Dashboard />))
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ status: 'not_implemented' }), {
      status: 501,
    }),
  )
  await click('Run optimization')
  expect(container.textContent).toContain('No calculations were performed')
  expect(container.textContent).not.toContain('Backend result received')
  expect(container.textContent).toContain('No optimization result yet')
  await click('AI assistant')
  expect(container.textContent).toContain('LIVE VERIFICATION PENDING')
})

it('shows loading, prevents repeat submissions and recovers after failure', async () => {
  await act(async () => root.render(<Dashboard />))
  let rejectRequest!: (error: Error) => void
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject }))
  const run = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run optimization')!
  await act(async () => { run.click(); run.click() })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/optimize?'))).toHaveLength(1)
  expect(run.disabled).toBe(true)
  expect(run.getAttribute('aria-busy')).toBe('true')
  expect(container.textContent).toContain('up to 45 seconds')
  await act(async () => rejectRequest(new DOMException('expired', 'TimeoutError')))
  expect(run.disabled).toBe(false)
  expect(container.textContent).toContain('timed out after 45 seconds')
  expect(container.textContent).toContain('No optimization result yet')
})

it('discards late results after a mode change and disables joint AI actions', async () => {
  await act(async () => root.render(<Dashboard />))
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  await click('Run optimization')
  const select = container.querySelector<HTMLSelectElement>('#scheduling-mode')!
  await act(async () => {
    select.value = 'joint'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () => resolve(new Response(JSON.stringify({
    feasibility_status: 'feasible', baseline_electricity_cost_usd: 20,
    optimized_electricity_cost_usd: 18, baseline_peak_demand_kw: 3,
    optimized_peak_demand_kw: 2, baseline_demand_kw: Array(24).fill(3),
    optimized_demand_kw: Array(24).fill(2), constraint_violations: [],
  }))))
  expect(container.textContent).not.toContain('Backend result received')
  expect(container.textContent).not.toContain('Displayed result mode')
  await click('AI assistant')
  expect(container.textContent).toContain('AI actions are disabled for joint scheduling')
})

it.each([false, true])('restores the AI handoff snapshot and isolates old responses (pending comparison: %s)', async pendingComparison => {
  await act(async () => root.render(<Dashboard />))
  await click('What-if scenarios')
  await act(async () => { await import('../components/dashboard/WhatIf') })
  await click('Create alternative from current')
  await input('alternative-limit', '10')
  let finishOldComparison!: (response: Response) => void
  if (pendingComparison) {
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finishOldComparison = resolve }))
    await click('Compare both scenarios')
  }
  await click('Scenario configuration')
  await input('limit', '20')
  await click('AI assistant')
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
    source: 'mock', status: 'proposed', message: 'Deterministic proposal',
    changes: { building_max_demand_kw: 15 },
    proposed_scenario: toScenario({ ...defaultEditor, limit: '15' }),
  })))
  await click('Keep peak power demand below 15 kW.')
  await click('Review proposed changes')
  await click('Compare as alternative')
  expect(container.querySelector<HTMLInputElement>('#alternative-limit')!.value).toBe('15')
  if (pendingComparison) {
    const oldResult = {
      feasibility_status: 'feasible', baseline_electricity_cost_usd: 20,
      optimized_electricity_cost_usd: 18, baseline_peak_demand_kw: 3,
      optimized_peak_demand_kw: 2, baseline_demand_kw: Array(24).fill(3),
      optimized_demand_kw: Array(24).fill(2), constraint_violations: [],
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(oldResult)))
    await act(async () => finishOldComparison(new Response(JSON.stringify(oldResult))))
    expect(container.querySelector('[aria-label="Business what-if comparison"]')!.textContent).not.toContain('Backend result')
    expect(container.textContent).not.toContain('Between scenarios: alternative minus current')
  }
  await click('Apply alternative to current')
  await click('Scenario configuration')
  expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe('15')
  await click('What-if scenarios')
  await click('Restore starting scenario')
  await click('Scenario configuration')
  expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe('20')
  expect(container.querySelector<HTMLSelectElement>('#scheduling-mode')!.value).toBe('ev_only')
})
