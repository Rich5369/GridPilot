import { apiRequest, isOptimizationResult } from './api'
import { matchesSubmittedPlan } from './operatingPlan'
import { matchesEvidence } from './infeasibilityEvidence'
import type { OptimizationResult, Scenario } from '../types/api'

export type ProposalChanges = {
  building_max_demand_kw?: number | null
  all_ev_deadline_hour?: number | null
  peak_price_increase_percent?: number | null
}
export type AdvisorComparison = {
  source: 'meta'
  explanation_source: 'meta' | 'unavailable'
  message: string
  follow_up_question: string | null
  changes: ProposalChanges
  proposed_scenario: Scenario
  scheduling_mode: 'ev_only' | 'joint'
  current: OptimizationResult
  alternative: OptimizationResult
  daily_cost_difference_usd: number | null
  peak_difference_kw: number | null
  warnings: string[]
  activity: string[]
}

const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
const sameScenario = (actual: Scenario, expected: Scenario) =>
  Object.entries(expected).every(([key, value]) => JSON.stringify(actual[key as keyof Scenario]) === JSON.stringify(value))
  && Object.keys(actual).every(key => key in expected)
const sameDifference = (actual: unknown, expected: number | null) => expected === null
  ? actual === null
  : typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-6

export async function compareWithAdvisor(scenario: Scenario, changes: ProposalChanges,
  proposed: Scenario, mode: 'ev_only' | 'joint', signal: AbortSignal): Promise<AdvisorComparison> {
  const body = await apiRequest<AdvisorComparison>('/api/ai/compare', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, changes, scheduling_mode: mode }), signal,
  })
  if (!body || body.source !== 'meta' || !['meta', 'unavailable'].includes(body.explanation_source)
    || body.scheduling_mode !== mode || typeof body.message !== 'string'
    || !(body.follow_up_question === null || typeof body.follow_up_question === 'string')
    || !strings(body.warnings) || !strings(body.activity)
    || !body.proposed_scenario || !sameScenario(body.proposed_scenario, proposed)
    || !body.changes || Object.keys(body.changes).some(key => !(key in changes) && body.changes[key as keyof ProposalChanges] != null)
    || Object.entries(changes).some(([key, value]) => (body.changes[key as keyof ProposalChanges] ?? null) !== (value ?? null))
    || !isOptimizationResult(body.current) || !isOptimizationResult(body.alternative)
    || !body.current.result_id || !body.alternative.result_id || body.current.result_id === body.alternative.result_id
    || !body.current.operating_plan || !body.alternative.operating_plan
    || !matchesSubmittedPlan(body.current, scenario, mode) || !matchesEvidence(body.current, scenario, mode)
    || !matchesSubmittedPlan(body.alternative, proposed, mode) || !matchesEvidence(body.alternative, proposed, mode)) {
    throw new Error('The comparison did not match the reviewed scenarios. No changes were applied.')
  }
  const both = body.current.feasibility_status === 'feasible' && body.alternative.feasibility_status === 'feasible'
  if (!sameDifference(body.daily_cost_difference_usd, both
    ? body.current.optimized_electricity_cost_usd! - body.alternative.optimized_electricity_cost_usd! : null)
    || !sameDifference(body.peak_difference_kw, both
      ? body.current.optimized_peak_demand_kw! - body.alternative.optimized_peak_demand_kw! : null)) {
    throw new Error('The comparison totals could not be verified. No changes were applied.')
  }
  return body
}
