// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CommandMetrics } from './CommandAnalytics'
import { MarketExplorer } from './MarketExplorer'
import type { OptimizationResult, Scenario } from '../../types/api'
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  AreaChart: () => null,
  Area: () => null,
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const result: OptimizationResult = {
  feasibility_status: 'feasible',
  baseline_electricity_cost_usd: 15,
  optimized_electricity_cost_usd: 18,
  baseline_peak_demand_kw: 10,
  optimized_peak_demand_kw: 12,
  baseline_demand_kw: Array(24).fill(10),
  optimized_demand_kw: Array(24).fill(12),
  constraint_violations: [],
}
const scenario: Scenario = {
  operating_hours: { start_hour: 8, end_hour: 18 },
  building_max_demand_kw: 15,
  electricity_prices_usd_per_kwh: Array(24).fill(0.1),
  fixed_demand_kw: Array(24).fill(5),
  ev_requirements: [],
}
it('keeps increased cost negative, headroom in kW, and previous-result provenance', async () => {
  const container = document.createElement('div'),
    root = createRoot(container)
  await act(async () =>
    root.render(<CommandMetrics result={result} scenario={scenario} stale />),
  )
  expect(
    [...container.querySelectorAll('.kpi-number')].map((n) => n.textContent),
  ).toEqual(['$18.00', '12.00 kW', '-$3.00', '3.00 kW'])
  expect(container.textContent).toContain('Previous submitted scenario')
  await act(async () =>
    root.render(
      <CommandMetrics
        result={{
          ...result,
          feasibility_status: 'infeasible',
          optimized_electricity_cost_usd: null,
          optimized_peak_demand_kw: null,
          optimized_demand_kw: null,
        }}
        scenario={scenario}
        stale={false}
      />,
    ),
  )
  expect(
    [...container.querySelectorAll('.kpi-number')].map((n) => n.textContent),
  ).toEqual(['—', '—', '—', '—'])
  await act(async () => root.unmount())
})
it('selects markets without inventing prices, observation times or coverage', async () => {
  const container = document.createElement('div'),
    root = createRoot(container)
  await act(async () => root.render(<MarketExplorer />))
  const button = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'NYISO',
  )!
  await act(async () => button.click())
  expect(button.getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.market-detail')?.textContent).toContain(
    'New York ISO',
  )
  expect(container.querySelector('.market-price')?.textContent).toContain('—')
  expect(container.textContent).toContain('No connected price feed')
  expect(container.textContent).toContain(
    'No service-area or nodal coverage implied',
  )
  await act(async () => root.unmount())
})
