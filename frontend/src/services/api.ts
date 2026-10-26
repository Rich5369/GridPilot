import type { HealthResponse } from '../types/api'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed (${status})`)
    this.status = status
    this.body = body
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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
