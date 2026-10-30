// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { Comparison } from './Comparison'
import type { OptimizationResult } from '../../types/api'
vi.mock('../DemandChart', () => ({ DemandChart: () => <div>Demand chart</div> }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const result: OptimizationResult = {
  feasibility_status: 'feasible', baseline_electricity_cost_usd: 20,
  optimized_electricity_cost_usd: 18, baseline_peak_demand_kw: 3,
  optimized_peak_demand_kw: 2, baseline_demand_kw: Array(24).fill(3),
  optimized_demand_kw: Array(24).fill(3), constraint_violations: [],
}
it.each([false, true])('uses returned costs and hourly energy, and labels stale results (%s)', async stale => {
  const container = document.createElement('div'), root = createRoot(container)
  await act(async () => root.render(<Comparison result={result} limit={25} stale={stale} />))
  expect(container.textContent).toContain('$2.00 lower energy charges for this day.')
  expect(container.textContent).toContain('72.0 kWh')
  expect(container.textContent).toContain('Lower costs do not imply lower energy consumption.')
  expect(container.textContent).toContain('Submitted limit 25 kW')
  expect(container.textContent!.includes('PREVIOUS SCENARIO · STALE')).toBe(stale)
  await act(async () => root.unmount())
})
it('explains infeasibility without inventing optimized metrics', async () => {
  const container = document.createElement('div'), root = createRoot(container)
  await act(async () => root.render(<Comparison stale={false} result={{ ...result,
    feasibility_status: 'infeasible', optimized_electricity_cost_usd: null,
    optimized_peak_demand_kw: null, optimized_demand_kw: null,
    constraint_violations: ['Site limit exceeded'],
  }} />))
  expect(container.textContent).toContain('No schedule meets all modeled constraints.')
  expect(container.textContent).toContain('Site limit exceeded')
  expect(container.textContent).not.toContain('lower energy charges')
  expect(container.textContent).toContain('Unavailable')
  await act(async () => root.unmount())
})
