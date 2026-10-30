// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { EnergyAssistant } from './EnergyAssistant'
import { defaultEditor, toScenario } from '../../data/demoScenario'
import { apiRequest } from '../../services/api'
vi.mock('../../services/api', async importOriginal => ({ ...await importOriginal<typeof import('../../services/api')>(), apiRequest: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('requires confirmation, applies validated changes and cancels proposals', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const change = vi.fn()
  vi.mocked(apiRequest).mockResolvedValue({ source: 'mock', category: 'scenario_proposal', status: 'proposed', message: 'Mock fixture', changes: { building_max_demand_kw: 15 }, proposed_scenario: toScenario({ ...defaultEditor, limit: '15' }) })
  const click = async (label: string) => { await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === label)!.click()) }
  try {
    await act(async () => root.render(<EnergyAssistant editor={defaultEditor} onChange={change} resultScenario={null} />))
    await click('Keep peak power demand below 15 kW.')
    await click('Send to advisor')
    expect(container.textContent).toContain('MOCK MODE — NOT META AI')
    expect(change).not.toHaveBeenCalled()
    await click('Cancel')
    expect(change).not.toHaveBeenCalled()
    await click('Send to advisor')
    await click('Apply Changes')
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...defaultEditor, limit: '15' })
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it('presents context, clarification and evidence without claiming unverified outcomes', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const click = async (label: string) => { await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === label)!.click()) }
  try {
    await act(async () => root.render(<EnergyAssistant editor={defaultEditor} onChange={vi.fn()} resultScenario={null} resultId="execution-fixture" />))
    expect(container.querySelector('details')!.open).toBe(false)
    expect(container.textContent).toContain('No business details yet')
    expect(container.querySelectorAll('input[placeholder="Not provided"]')).toHaveLength(8)
    vi.mocked(apiRequest).mockResolvedValue({ source: 'mock', category: 'clarification_required', message: 'Does this limit apply to the entire building?', follow_up_questions: ['Which equipment can shift without affecting staff? This defines flexibility.'], facts: ['No retained verified result for this submitted scenario.'], profile: { business_type: 'Office', employee_count: 0 }, changes: {}, proposed_scenario: null })
    await click('Keep peak power demand below 15 kW.')
    await click('Send to advisor')
    expect(container.querySelector('[aria-label="Follow-up questions"]')!.textContent).toContain('Which equipment can shift')
    expect(container.querySelector('.clarification_required')!.textContent).toContain('Clarification needed')
    expect(container.querySelector('.advisor-context-summary')!.textContent).toContain('Office')
    expect(container.querySelector('.advisor-context-summary')!.textContent).toContain('0')
    expect(container.querySelectorAll('.advisor-provenance')).toHaveLength(2)
    expect(container.querySelector('.advisor-verified')).toBeNull()
    expect(container.querySelector('.advisor-proposal')).toBeNull()
    vi.mocked(apiRequest).mockResolvedValue({ source: 'mock', category: 'answer', message: 'From your submitted engineering scenario:', facts: ['Verified submitted ev_only result: baseline daily energy charges USD 10.0000; optimized daily energy charges: USD 8.0000.'], profile: {}, changes: {}, proposed_scenario: null })
    await click('Send to advisor')
    expect(container.querySelector('.advisor-verified')!.textContent).toContain('Verified solver result')
    const body = JSON.parse(vi.mocked(apiRequest).mock.calls.at(-1)![1]!.body as string)
    expect(body.result_id).toBe('execution-fixture')
    expect(body.history[1].content).toContain('Which equipment can shift')
    expect(body.history).toHaveLength(2)
    expect(Object.keys(body.history[1]).sort()).toEqual(['content', 'role'])
    expect(container.querySelector('textarea')!.getAttribute('aria-describedby')).toBe('advisor-composer-help')
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})

it('keeps a proposal reviewable and disables actions when the draft changes', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const change = vi.fn(), compare = vi.fn()
  const render = (limit: string) => root.render(<EnergyAssistant editor={{...defaultEditor, limit}} onChange={change} onCompareProposal={compare} resultScenario={null} />)
  const click = async (label: string) => { await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === label)!.click()) }
  vi.mocked(apiRequest).mockResolvedValue({ source: 'mock', category: 'scenario_proposal', message: 'Review proposed cap.', facts: [], profile: {}, changes: { building_max_demand_kw: 15 }, proposed_scenario: toScenario({...defaultEditor, limit:'15'}) })
  try {
    await act(async () => render(defaultEditor.limit))
    await click('Keep peak power demand below 15 kW.')
    await click('Send to advisor')
    expect(container.querySelector('.advisor-proposal')!.textContent).toContain('15 kW')
    expect(container.querySelector('.advisor-proposal')!.textContent).toContain('Not yet applied')
    await act(async () => render('30'))
    for (const label of ['Apply Changes', 'Compare as alternative']) {
      const button = [...container.querySelectorAll('button')].find(b => b.textContent === label)!
      expect(button.disabled).toBe(true)
      await act(async () => button.click())
    }
    expect(change).not.toHaveBeenCalled()
    expect(compare).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
