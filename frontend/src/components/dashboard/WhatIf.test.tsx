// @vitest-environment jsdom
import { act, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { WhatIf } from './WhatIf'
import { defaultEditor } from '../../data/demoScenario'
import { optimizeScenario } from '../../services/api'
vi.mock('../../services/api', async original => ({ ...await original<typeof import('../../services/api')>(), optimizeScenario: vi.fn() }))
vi.mock('./Comparison', () => ({ Comparison: () => <div>Solver chart</div> }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
let host: HTMLDivElement
function Harness() {
  const [editor, setEditor] = useState(defaultEditor)
  const [alt, setAlt] = useState({ ...defaultEditor, limit: '15' })
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  return <><button onClick={() => setEditor({ ...editor, limit: '20' })}>Edit current</button><WhatIf editor={editor} onChange={setEditor} alternative={alt} setAlternative={setAlt} busy={busy} acquire={() => { if (lock.current) return false; lock.current = true; setBusy(true); return true }} release={() => { lock.current = false; setBusy(false) }} /></>
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
