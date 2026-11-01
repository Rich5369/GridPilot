import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { Overview } from './Overview'
import example from '../../data/examplePlan.json'
import type { OptimizationResult } from '../../types/api'
vi.mock('../DemandChart', () => ({ DemandChart: () => <div data-chart="demand" /> }))
const render = (changes: Partial<Parameters<typeof Overview>[0]> = {}) => renderToStaticMarkup(<Overview result={null} scenario={null} stale={false} busy={false} invalid={false} message="" onNavigate={() => {}} {...changes} />)
it('shows one next step area before a calculation without empty metrics or charts', () => {
  const html = render()
  expect(html).toContain('Evaluate an improvement')
  expect(html).not.toContain('data-chart')
  expect(html).not.toContain('Daily cost difference')
  expect(render({busy:true})).toContain('Calculating your energy plan')
  expect(render({invalid:true})).toContain('Complete your energy inputs')
})
it('keeps failure and infeasibility distinct and presents retries without data substitution', () => {
  const html = render({message:'The calculation service is unavailable. Please try again.'})
  expect(html).toContain('Your energy plan needs attention')
  expect(html).not.toContain('proven infeasibility')
})
it('shows the submitted site limit, zero and negative differences honestly and guards invalid baselines', () => {
  const result = structuredClone(example.result) as OptimizationResult
  result.baseline_electricity_cost_usd = 0
  result.optimized_electricity_cost_usd = 1
  const html = render({result, scenario:example.scenario, stale:true})
  expect(html).toContain('-$1.00')
  expect(html).toContain('25 kW')
  expect(html).toContain('Your inputs have changed')
  result.optimized_electricity_cost_usd = 0
  expect(render({result, scenario:example.scenario})).toContain('$0.00')
  result.operating_plan!.baseline_constraint_violations = ['Baseline exceeds limit']
  expect(render({result, scenario:example.scenario})).toContain('Comparison unavailable')
})
it('keeps ready-plan limitations in a closed disclosure and removes the duplicate Advisor control', () => {
  const html = render({result:example.result as OptimizationResult, scenario:example.scenario})
  expect(html).toContain('Your energy plan')
  expect(html).toContain('<details class="calculation-details"><summary>Calculation details</summary>')
  expect(html).toContain('Fixed and demand charges are excluded')
  expect(html).not.toContain('Explain this result')
  expect(html).not.toContain('<p role="status">')
  expect(html).toContain('Power usage throughout the day (kW)')
})
