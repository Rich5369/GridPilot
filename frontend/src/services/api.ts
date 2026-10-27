import type { HealthResponse, OptimizationResult, Scenario } from '../types/api'

const baseUrl = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:8000' : '')
).replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!baseUrl)
    throw new Error(
      'Backend is not configured. Set VITE_API_BASE_URL to enable optimization.',
    )
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(5000),
    headers,
  })
  const body: unknown = await response.json()
  if (!response.ok) throw new ApiError(response.status, body)
  return body as T
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const health = await apiRequest<HealthResponse>('/api/health', { signal })
  if (health.status !== 'ok' || health.project !== 'GridPilot') {
    throw new Error('Unexpected health response')
  }
  return health
}

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const demand = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 24 && v.every((n) => finite(n) && n >= 0)
export function isOptimizationResult(
  body: unknown,
): body is OptimizationResult {
  if (!body || typeof body !== 'object') return false
  const r = body as Record<string, unknown>
  if (
    !finite(r.baseline_electricity_cost_usd) ||
    !finite(r.baseline_peak_demand_kw) ||
    r.baseline_peak_demand_kw < 0 ||
    !demand(r.baseline_demand_kw) ||
    !Array.isArray(r.constraint_violations) ||
    !r.constraint_violations.every((v) => typeof v === 'string')
  )
    return false
  if (r.feasibility_status === 'feasible')
    return (
      finite(r.optimized_electricity_cost_usd) &&
      finite(r.optimized_peak_demand_kw) &&
      r.optimized_peak_demand_kw >= 0 &&
      demand(r.optimized_demand_kw) &&
      r.constraint_violations.length === 0
    )
  return (
    r.feasibility_status === 'infeasible' &&
    r.optimized_electricity_cost_usd === null &&
    r.optimized_peak_demand_kw === null &&
    r.optimized_demand_kw === null &&
    r.constraint_violations.length > 0
  )
}
export async function optimizeScenario(
  scenario: Scenario,
): Promise<OptimizationResult> {
  const body = await apiRequest<unknown>('/api/optimize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario),
  })
  if (
    body &&
    typeof body === 'object' &&
    'status' in body &&
    body.status === 'not_implemented'
  )
    throw new Error(
      'Optimization is not implemented yet. No calculations were performed.',
    )
  if (!isOptimizationResult(body))
    throw new Error(
      'The backend returned an invalid optimization result. No result was accepted.',
    )
  return body
}
export function optimizationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 501)
      return 'Optimization is not implemented yet. No calculations were performed. Demo data remains available.'
    if (error.status === 422)
      return 'The backend rejected this scenario (HTTP 422). Review the configuration and API contract.'
    return `Optimization service returned HTTP ${error.status}. Please try again later.`
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name))
  )
    return 'Optimization service is unavailable or timed out. Check the backend connection and try again. No result was generated.'
  return error instanceof Error
    ? error.message
    : 'Optimization request failed. No result was generated.'
}
