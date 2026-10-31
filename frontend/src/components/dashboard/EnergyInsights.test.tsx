import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { EnergyInsights } from './EnergyInsights'
import type { OptimizationResult } from '../../types/api'
import { defaultEditor, toScenario } from '../../data/demoScenario'
const scenario = toScenario(defaultEditor)
const demand = Array(24).fill(2)
const cost = demand.reduce(
  (s, v, h) => s + v * scenario.electricity_prices_usd_per_kwh[h],
  0,
)
const result: OptimizationResult = {
  feasibility_status: 'feasible',
  baseline_demand_kw: demand,
  optimized_demand_kw: demand,
  baseline_electricity_cost_usd: cost,
  optimized_electricity_cost_usd: cost,
  baseline_peak_demand_kw: 2,
  optimized_peak_demand_kw: 2,
  constraint_violations: [],
}
it('supports both scheduling semantics without a provider or fabricated control claims', () => {
  const ev = renderToStaticMarkup(
    <EnergyInsights
      scenario={scenario}
      result={result}
      stale={false}
      mode="ev_only"
    />,
  )
  const joint = renderToStaticMarkup(
    <EnergyInsights
      scenario={scenario}
      result={result}
      stale={false}
      mode="joint"
    />,
  )
  expect(ev).toContain('Only EV charging is eligible to move')
  expect(joint).toContain(
    'EV charging and eligible flexible equipment can move',
  )
  expect(joint).toContain('Fixed building loads stay unchanged')
  expect(joint).toContain('8.0% of the submitted 25 kW cap')
})
it('shows infeasibility evidence verbatim without optimized costs or recovery advice', () => {
  const html = renderToStaticMarkup(
    <EnergyInsights
      scenario={scenario}
      result={{
        ...result,
        feasibility_status: 'infeasible',
        optimized_demand_kw: null,
        optimized_electricity_cost_usd: null,
        optimized_peak_demand_kw: null,
        constraint_violations: ['Specific solver evidence'],
      }}
      stale={false}
      mode="joint"
    />,
  )
  expect(html).toContain('Specific solver evidence')
  expect(html).toContain('Optimized hourly costs unavailable')
  expect(html).not.toContain('Optimized expenditure')
  expect(html).not.toContain('lower</strong> than baseline')
})
it('renders unavailable snapshot data safely and no insight panel before submission', () => {
  expect(
    renderToStaticMarkup(
      <EnergyInsights
        scenario={null}
        result={null}
        stale={false}
        mode="joint"
      />,
    ),
  ).toBe('')
  const html = renderToStaticMarkup(
    <EnergyInsights scenario={null} result={result} stale mode="ev_only" />,
  )
  expect(html).toContain('previous submitted inputs')
  expect(html).toContain('Peak intelligence unavailable')
  expect(html).toContain('Verified cost and peak changes are unavailable')
})
it('does not label solver tolerance noise as a cost increase', () => {
  const html = renderToStaticMarkup(
    <EnergyInsights
      scenario={scenario}
      result={{ ...result, optimized_electricity_cost_usd: cost + 1e-7 }}
      stale={false}
      mode="ev_only"
    />,
  )
  expect(html).toContain('unchanged at cent precision')
  expect(html).not.toContain('$0.00 higher')
})
it('describes fixed-only and equipment-only analysis without claiming absent EVs can move', () => {
  const fixed = { ...scenario, ev_requirements: [], flexible_equipment: [] }
  const html = renderToStaticMarkup(
    <EnergyInsights
      scenario={fixed}
      result={result}
      stale={false}
      mode="joint"
    />,
  )
  expect(html).toContain('Building electricity only')
  expect(html).toContain('No schedulable equipment is configured.')
  expect(html).not.toContain(
    'EV charging and eligible flexible equipment can move',
  )
  const equipment = { ...scenario, ev_requirements: [] }
  const equipmentHtml = renderToStaticMarkup(
    <EnergyInsights
      scenario={equipment}
      result={result}
      stale={false}
      mode="joint"
    />,
  )
  expect(equipmentHtml).toContain('Flexible equipment only')
  expect(equipmentHtml).toContain(
    'Eligible flexible equipment can move within its submitted window.',
  )
})
