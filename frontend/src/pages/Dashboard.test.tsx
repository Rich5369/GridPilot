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
  Comparison: ({
    result,
    stale,
    limit,
  }: {
    result: unknown
    stale: boolean
    limit?: number
  }) => (
    <div data-testid="result" data-stale={stale} data-limit={limit}>
      {result ? 'Backend result' : 'No optimization result yet'}
    </div>
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
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `#${id}`,
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      element.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value)
    element.dispatchEvent(
      new Event(element.tagName === 'SELECT' ? 'change' : 'input', {
        bubbles: true,
      }),
    )
  })
}
it('shows current draft inputs without fictional result metrics and validates edits', async () => {
  await act(async () => root.render(<Dashboard />))
  expect(container.textContent).not.toContain('128.8')
  expect(container.textContent).toContain('No optimization result yet')
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
  expect(container.textContent).not.toContain('128.8')
  expect(container.textContent).toContain('No optimization result yet')
  expect(container.textContent).toContain('15 kW')
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
  expect(container.textContent).toContain('No advisor reply yet')
})

it('shows loading, prevents repeat submissions and recovers after failure', async () => {
  await act(async () => root.render(<Dashboard />))
  let rejectRequest!: (error: Error) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject
      }),
  )
  const run = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Run optimization',
  )!
  await act(async () => {
    run.click()
    run.click()
  })
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/optimize?'),
    ),
  ).toHaveLength(1)
  expect(run.disabled).toBe(true)
  expect(run.getAttribute('aria-busy')).toBe('true')
  expect(container.textContent).toContain('up to 45 seconds')
  await act(async () =>
    rejectRequest(new DOMException('expired', 'TimeoutError')),
  )
  expect(run.disabled).toBe(false)
  expect(container.textContent).toContain('timed out after 45 seconds')
  expect(container.textContent).toContain('No optimization result yet')
})

it('discards late results after a mode change and disables joint AI actions', async () => {
  await act(async () => root.render(<Dashboard />))
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await click('Run optimization')
  const select = container.querySelector<HTMLSelectElement>('#analysis-choice')!
  await act(async () => {
    select.value = 'joint'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await act(async () =>
    resolve(
      new Response(
        JSON.stringify({
          feasibility_status: 'feasible',
          baseline_electricity_cost_usd: 20,
          optimized_electricity_cost_usd: 18,
          baseline_peak_demand_kw: 3,
          optimized_peak_demand_kw: 2,
          baseline_demand_kw: Array(24).fill(3),
          optimized_demand_kw: Array(24).fill(2),
          constraint_violations: [],
        }),
      ),
    ),
  )
  expect(container.textContent).not.toContain('Backend result received')
  expect(container.textContent).not.toContain('Displayed result mode')
  await click('AI assistant')
  expect(container.textContent).toContain('GridPilot Energy Advisor')
})

it.each([false, true])(
  'restores the AI handoff snapshot and isolates old responses (pending comparison: %s)',
  async (pendingComparison) => {
    await act(async () => root.render(<Dashboard />))
    await click('What-if scenarios')
    await act(async () => {
      await import('../components/dashboard/WhatIf')
    })
    await click('Create alternative from current')
    await input('alternative-limit', '10')
    let finishOldComparison!: (response: Response) => void
    if (pendingComparison) {
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOldComparison = resolve
          }),
      )
      await click('Compare both scenarios')
    }
    await click('Scenario configuration')
    await input('limit', '20')
    await click('AI assistant')
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          source: 'mock',
          category: 'scenario_proposal',
          status: 'proposed',
          message: 'Deterministic proposal',
          changes: { building_max_demand_kw: 15 },
          proposed_scenario: toScenario({ ...defaultEditor, limit: '15' }),
        }),
      ),
    )
    await click('Keep peak power demand below 15 kW.')
    await click('Send to advisor')
    await click('Compare as alternative')
    expect(
      container.querySelector<HTMLInputElement>('#alternative-limit')!.value,
    ).toBe('15')
    if (pendingComparison) {
      const oldResult = {
        feasibility_status: 'feasible',
        baseline_electricity_cost_usd: 20,
        optimized_electricity_cost_usd: 18,
        baseline_peak_demand_kw: 3,
        optimized_peak_demand_kw: 2,
        baseline_demand_kw: Array(24).fill(3),
        optimized_demand_kw: Array(24).fill(2),
        constraint_violations: [],
      }
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(oldResult)))
      await act(async () =>
        finishOldComparison(new Response(JSON.stringify(oldResult))),
      )
      expect(
        container.querySelector('[aria-label="Business what-if comparison"]')!
          .textContent,
      ).not.toContain('Backend result')
      expect(container.textContent).not.toContain(
        'Between scenarios: alternative minus current',
      )
    }
    await click('Apply alternative to current')
    await click('Scenario configuration')
    expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe(
      '15',
    )
    await click('What-if scenarios')
    await click('Restore starting scenario')
    await click('Scenario configuration')
    expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe(
      '20',
    )
    expect(
      container.querySelector<HTMLSelectElement>('#analysis-choice')!.value,
    ).toBe('held')
  },
)

it('guides configuration to results and labels demonstration inputs on overview', async () => {
  await act(async () => root.render(<Dashboard />))
  expect(
    container.querySelector('[aria-label="Energy planning workflow"]'),
  ).toBeTruthy()
  expect(container.textContent).toContain(
    'Fictional demonstration inputs; not meter data.',
  )
  await click('1. Configure scenario')
  expect(container.querySelector('#limit')).toBeTruthy()
  expect(container.querySelector('.demo-banner')).toBeNull()
  await input('evEnergy', '18')
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        feasibility_status: 'feasible',
        baseline_electricity_cost_usd: 20,
        optimized_electricity_cost_usd: 18,
        baseline_peak_demand_kw: 3,
        optimized_peak_demand_kw: 2,
        baseline_demand_kw: Array(24).fill(3),
        optimized_demand_kw: Array(24).fill(2),
        constraint_violations: [],
      }),
    ),
  )
  await click('Run optimization')
  expect(container.textContent).toContain(
    'Result available · Advanced: hold equipment at baseline (EV-only mode) · feasible',
  )
  const request = fetchMock.mock.calls.find(([url]) =>
    String(url).includes('/api/optimize?'),
  )!
  expect(
    JSON.parse(request[1].body).ev_requirements[0].energy_required_kwh,
  ).toBe(18)
  await click('1. Configure scenario')
  await input('evEnergy', '19')
  expect(container.textContent).toContain(
    'Inputs changed · Run optimization to update your results',
  )
  await click('3. Compare alternatives')
  expect(
    container.querySelector('[aria-label="Business what-if comparison"]'),
  ).toBeTruthy()
})

async function selectProfile(value: string, prefix = 'current') {
  const element = container.querySelector<HTMLSelectElement>(
    `#${prefix}-fixed-demand-mode`,
  )!
  await act(async () => {
    element.value = value
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

it('submits custom demand, marks edited results stale, validates and restores the demo profile', async () => {
  await act(async () => root.render(<Dashboard />))
  await click('Scenario configuration')
  await selectProfile('custom')
  await input('current-fixed-demand-0', '0')
  await input('current-fixed-demand-10', '12.75')
  const expected = toScenario(defaultEditor).fixed_demand_kw
  expected[0] = 0
  expected[10] = 12.75
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        feasibility_status: 'feasible',
        baseline_electricity_cost_usd: 20,
        optimized_electricity_cost_usd: 18,
        baseline_peak_demand_kw: 3,
        optimized_peak_demand_kw: 2,
        baseline_demand_kw: Array(24).fill(3),
        optimized_demand_kw: Array(24).fill(2),
        constraint_violations: [],
      }),
    ),
  )
  await click('Run optimization')
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).includes('/api/optimize?'),
  )!
  expect(JSON.parse(call[1].body)).toEqual({
    ...toScenario(defaultEditor),
    fixed_demand_kw: expected,
  })
  expect(container.textContent).toContain(
    'Optimizer-calculated result · Submitted inputs: User-configured',
  )
  await click('Scenario configuration')
  await input('current-fixed-demand-1', '')
  expect(
    container
      .querySelector('#current-fixed-demand-1')!
      .getAttribute('aria-invalid'),
  ).toBe('true')
  expect(
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Run optimization',
    )!.disabled,
  ).toBe(true)
  expect(container.textContent).toContain('Inputs changed · Run optimization')
  await input('current-fixed-demand-1', '2')
  await selectProfile('demo')
  expect(container.querySelector('#current-fixed-demand-0')).toBeNull()
  await selectProfile('custom')
  expect(
    container.querySelector<HTMLInputElement>('#current-fixed-demand-10')!
      .value,
  ).toBe('12.75')
  await click('Reset to Default Scenario')
  expect(
    container.querySelector<HTMLSelectElement>('#current-fixed-demand-mode')!
      .value,
  ).toBe('demo')
})

it('keeps hourly profile snapshots independent through What-if edit, apply and restore', async () => {
  await act(async () => root.render(<Dashboard />))
  await click('Scenario configuration')
  await selectProfile('custom')
  await input('current-fixed-demand-10', '10')
  await click('What-if scenarios')
  await click('Create alternative from current')
  expect(
    container.querySelector<HTMLInputElement>('#alternative-fixed-demand-10')!
      .value,
  ).toBe('10')
  await input('alternative-fixed-demand-10', '20')
  await click('Scenario configuration')
  expect(
    container.querySelector<HTMLInputElement>('#current-fixed-demand-10')!
      .value,
  ).toBe('10')
  await input('current-fixed-demand-10', '12')
  await click('What-if scenarios')
  expect(
    container.querySelector<HTMLInputElement>('#alternative-fixed-demand-10')!
      .value,
  ).toBe('20')
  await click('Apply alternative to current')
  await click('Scenario configuration')
  expect(
    container.querySelector<HTMLInputElement>('#current-fixed-demand-10')!
      .value,
  ).toBe('20')
  await click('What-if scenarios')
  await click('Restore starting scenario')
  await click('Scenario configuration')
  expect(
    container.querySelector<HTMLInputElement>('#current-fixed-demand-10')!
      .value,
  ).toBe('10')
})

it('keeps submitted limits and provenance when the draft changes and returns results to overview', async () => {
  await act(async () => root.render(<Dashboard />))
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        feasibility_status: 'feasible',
        baseline_electricity_cost_usd: 20,
        optimized_electricity_cost_usd: 18,
        baseline_peak_demand_kw: 3,
        optimized_peak_demand_kw: 2,
        baseline_demand_kw: Array(24).fill(3),
        optimized_demand_kw: Array(24).fill(2),
        constraint_violations: [],
      }),
    ),
  )
  await click('Run optimization')
  await click('Scenario configuration')
  await input('limit', '10')
  await click('Energy overview')
  const result = container.querySelector('[data-testid="result"]')!
  expect(result.getAttribute('data-stale')).toBe('true')
  expect(result.getAttribute('data-limit')).toBe('25')
  expect(
    container.querySelector('[aria-label="Editable draft"]')!.textContent,
  ).toContain('10 kW')
  expect(
    container.querySelector('[aria-label="Submitted snapshot"]')!.textContent,
  ).toContain('25 kW')
  expect(container.textContent).toContain('Backend result')
  expect(container.textContent).not.toContain('128.8')
})

it('marks a late response stale if the draft was edited while the request was running', async () => {
  await act(async () => root.render(<Dashboard />))
  let resolve!: (value: Response) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  await click('Run optimization')
  await click('Scenario configuration')
  await input('limit', '12')
  await act(async () =>
    resolve(
      new Response(
        JSON.stringify({
          feasibility_status: 'feasible',
          baseline_electricity_cost_usd: 20,
          optimized_electricity_cost_usd: 18,
          baseline_peak_demand_kw: 3,
          optimized_peak_demand_kw: 2,
          baseline_demand_kw: Array(24).fill(3),
          optimized_demand_kw: Array(24).fill(2),
          constraint_violations: [],
        }),
      ),
    ),
  )
  expect(
    container
      .querySelector('[data-testid="result"]')!
      .getAttribute('data-stale'),
  ).toBe('true')
  expect(
    container.querySelector('[aria-label="Submitted snapshot"]')!.textContent,
  ).toContain('25 kW')
  expect(
    container.querySelector('[aria-label="Editable draft"]')!.textContent,
  ).toContain('12 kW')
})

it.each(['ev_only', 'joint'])(
  'exposes the %s scheduling assumptions through a native labeled disclosure',
  async (mode) => {
    await act(async () => root.render(<Dashboard />))
    const select =
      container.querySelector<HTMLSelectElement>('#analysis-choice')!
    await act(async () => {
      select.value = mode === 'ev_only' ? 'held' : mode
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const disclosure =
      container.querySelector<HTMLDetailsElement>('.mode-explanation')!
    expect(disclosure.open).toBe(false)
    expect(select.getAttribute('aria-describedby')!.split(' ')).toContain(
      disclosure.querySelector('summary')!.id,
    )
    expect(disclosure.textContent).toContain(
      mode === 'joint'
        ? 'Flexible equipment is modeled as interruptible and continuously adjustable'
        : 'Equipment and fixed building demand stay unchanged.',
    )
    if (mode === 'joint')
      expect(disclosure.textContent).toContain(
        'Uninterrupted machine cycles are not modeled.',
      )
    await act(async () => disclosure.querySelector('summary')!.click())
    expect(disclosure.open).toBe(true)
  },
)

it.each(['custom', 'sources'])(
  'keeps all submitted %s profile entries independent of later draft edits',
  async (profile) => {
    await act(async () => root.render(<Dashboard />))
    await click('Scenario configuration')
    await selectProfile(profile)
    if (profile === 'sources') await click('Add Lighting')
    const id =
      profile === 'sources'
        ? 'current-fixed-demand-source-0-'
        : 'current-fixed-demand-'
    await input(`${id}0`, '2.125')
    await input(`${id}23`, '3.75')
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          feasibility_status: 'feasible',
          baseline_electricity_cost_usd: 20,
          optimized_electricity_cost_usd: 18,
          baseline_peak_demand_kw: 3,
          optimized_peak_demand_kw: 2,
          baseline_demand_kw: Array(24).fill(3),
          optimized_demand_kw: Array(24).fill(2),
          constraint_violations: [],
        }),
      ),
    )
    await click('Run optimization')
    await click('Scenario configuration')
    await input(`${id}0`, '9.5')
    await click('Energy overview')
    const snapshot = container.querySelector(
      '[aria-label="Submitted snapshot hourly fixed-demand inputs"]',
    )!
    const draft = container.querySelector(
      '[aria-label="Editable draft hourly fixed-demand inputs"]',
    )!
    expect(snapshot.querySelectorAll('tbody tr')).toHaveLength(24)
    expect(snapshot.querySelector('tbody tr td')!.textContent).toBe('2.125')
    expect(snapshot.querySelector('tbody tr:last-child td')!.textContent).toBe(
      '3.75',
    )
    expect(draft.querySelector('tbody tr td')!.textContent).toBe('9.5')
    expect(snapshot.textContent).toContain('Submitted snapshot')
    expect(snapshot.querySelectorAll('input')).toHaveLength(0)
    expect(
      container
        .querySelector('[data-testid="result"]')!
        .getAttribute('data-stale'),
    ).toBe('true')
  },
)

it('keeps insights on submitted prices and cap across stale edits and clears on mode change', async () => {
  await act(async () => root.render(<Dashboard />))
  const scenario = toScenario(defaultEditor),
    demand = Array(24).fill(2)
  const cost = demand.reduce(
    (sum, value, hour) =>
      sum + value * scenario.electricity_prices_usd_per_kwh[hour],
    0,
  )
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        feasibility_status: 'feasible',
        baseline_electricity_cost_usd: cost,
        optimized_electricity_cost_usd: cost,
        baseline_peak_demand_kw: 2,
        optimized_peak_demand_kw: 2,
        baseline_demand_kw: demand,
        optimized_demand_kw: demand,
        constraint_violations: [],
      }),
    ),
  )
  await click('Run optimization')
  const panel = () =>
    container.querySelector('[aria-label="Deterministic energy insights"]')!
  expect(panel().textContent).toContain('Optimized expenditure')
  expect(panel().textContent).toContain('8.0% of the submitted 25 kW cap')
  const before = panel().querySelector('.insight-periods')!.textContent
  await click('Scenario configuration')
  await input('peak', '0.99')
  await input('limit', '10')
  await click('Energy overview')
  expect(panel().textContent).toContain('previous submitted inputs')
  expect(panel().textContent).toContain('8.0% of the submitted 25 kW cap')
  expect(panel().querySelector('.insight-periods')!.textContent).toBe(before)
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/optimize?'),
    ),
  ).toHaveLength(1)
  await act(async () => {
    const select =
      container.querySelector<HTMLSelectElement>('#analysis-choice')!
    select.value = 'joint'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(panel()).toBeNull()
})
