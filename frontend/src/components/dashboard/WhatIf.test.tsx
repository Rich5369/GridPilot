// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WhatIf } from './WhatIf'
import { defaultEditor } from '../../data/demoScenario'
import type { SchedulingMode } from '../../services/api'
import { optimizeScenario } from '../../services/api'
vi.mock('../../services/api', async original => ({ ...await original<typeof import('../../services/api')>(), optimizeScenario: vi.fn() }))
vi.mock('./Comparison', () => ({ Comparison: () => <div>Solver chart</div> }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let host: HTMLDivElement
function Harness() {
  const [mode, setMode] = useState<SchedulingMode>('ev_only')
  const [editor, setEditor] = useState(defaultEditor)
  const [alt, setAlt] = useState({ ...defaultEditor, limit: '15' })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  return <><button onClick={() => setMode('joint')}>Select joint</button><button onClick={() => setEditor({ ...editor, limit: '20' })}>Edit current</button><WhatIf mode={mode} editor={editor} onChange={setEditor} alternative={alt} setAlternative={setAlt} busy={busy} acquire={() => { if (lock.current) return false; lock.current = true; setBusy(true); return true }} release={() => { lock.current = false; setBusy(false) }} /></>
}
async function mount() { host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => root.render(<Harness />)) }
async function click(text: string) { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === text)!.click()) }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); vi.mocked(optimizeScenario).mockReset() })
it('stops the sequence after a timeout because the server may still be solving', async () => {
  vi.mocked(optimizeScenario).mockRejectedValue(new DOMException('expired', 'TimeoutError'))
  await mount(); await click('Compare both scenarios')
  expect(optimizeScenario).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('Not run because the first request timed out')
  expect(host.textContent).not.toContain('Solver chart')
})
it('does not publish a late result as current after configuration changes', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof optimizeScenario>>) => void
  vi.mocked(optimizeScenario).mockImplementationOnce(() => new Promise(r => { resolve = r }))
  const result = { feasibility_status: 'feasible' as const, baseline_electricity_cost_usd: 123, optimized_electricity_cost_usd: 100, baseline_peak_demand_kw: 20, optimized_peak_demand_kw: 15, baseline_demand_kw: Array(24).fill(10), optimized_demand_kw: Array(24).fill(10), constraint_violations: [] }
  vi.mocked(optimizeScenario).mockResolvedValue(result)
  await mount(); await click('Compare both scenarios'); await click('Edit current')
  await act(async () => resolve(result))
  expect(host.textContent).toContain('Outdated comparison results are hidden')
  expect(host.textContent).not.toContain('Solver chart')
  expect(vi.mocked(optimizeScenario).mock.calls[0][0].building_max_demand_kw).toBe(25)
  expect(vi.mocked(optimizeScenario).mock.calls[1][0].building_max_demand_kw).toBe(15)
})

it.each([
  ['reported Pair B roundoff', 128.8, 128.79999999999998, '0.00'],
  ['negative zero', 0, -0, '0.00'],
  ['ordinary zero', 0, 0, '0.00'],
  ['meaningful negative difference', 1, 0.1, '-0.90'],
  ['negative one hundredth', 1, 0.99, '-0.01'],
  ['negative below rounding threshold', 1, 0.995001, '0.00'],
  ['negative above rounding threshold', 1, 0.994999, '-0.01'],
  ['negative at rounding threshold', 0.005, 0, '-0.01'],
  ['positive below rounding threshold', 1, 1.004999, '0.00'],
  ['positive above rounding threshold', 1, 1.005001, '0.01'],
  ['positive at rounding threshold', 0, 0.005, '0.01'],
  ['meaningful positive difference', 1, 1.9, '0.90'],
])('renders signed What-if differences correctly for %s', async (_name, current, alternative, expected) => {
  // Put energy in one hourly interval so the component performs the actual sum
  // and alternative-minus-current subtraction. Peak uses the same input values.
  const response = (value: number) => ({
    feasibility_status: 'feasible' as const,
    baseline_electricity_cost_usd: value,
    optimized_electricity_cost_usd: value,
    baseline_peak_demand_kw: value,
    optimized_peak_demand_kw: value,
    baseline_demand_kw: [value, ...Array<number>(23).fill(0)],
    optimized_demand_kw: [value, ...Array<number>(23).fill(0)],
    constraint_violations: [],
  })
  const currentResult = response(current), alternativeResult = response(alternative)
  const originals = structuredClone([currentResult, alternativeResult])
  vi.mocked(optimizeScenario).mockResolvedValueOnce(currentResult).mockResolvedValueOnce(alternativeResult)
  await mount(); await click('Compare both scenarios')
  const displayed = (label: string) => [...host.querySelectorAll('dt')]
    .find(term => term.textContent === label)?.nextElementSibling?.textContent
  expect(displayed('Optimized consumption difference')).toBe(`${expected} kWh`)
  expect(displayed('Optimized peak demand difference')).toBe(`${expected} kW`)
  expect(host.textContent).not.toContain('-0.00 kWh')
  expect(host.textContent).not.toContain('-0.00 kW')
  expect([currentResult, alternativeResult]).toEqual(originals)
})


it('uses joint mode for both snapshots and hides the old comparison on mode change', async () => {
  const result = { feasibility_status: 'infeasible' as const, baseline_electricity_cost_usd: 1, baseline_peak_demand_kw: 1, baseline_demand_kw: Array(24).fill(1), optimized_electricity_cost_usd: null, optimized_peak_demand_kw: null, optimized_demand_kw: null, constraint_violations: ['Capacity'] }
  vi.mocked(optimizeScenario).mockResolvedValue(result)
  await mount(); await click('Compare both scenarios'); await click('Select joint')
  expect(host.textContent).toContain('Outdated comparison results are hidden')
  await click('Compare both scenarios')
  expect(vi.mocked(optimizeScenario).mock.calls.slice(-2).map(call => call[1])).toEqual(['joint', 'joint'])
  expect(host.textContent).toContain('Analysis for both scenarios: EV charging and flexible equipment')
})
