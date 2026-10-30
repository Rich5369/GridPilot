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
