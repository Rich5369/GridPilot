/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { ApiError, apiRequest, getHealth } from './api'

// Opt-in: start uvicorn, then set GRIDPILOT_LIVE_API=1 to exercise real HTTP.
it.skipIf(process.env.GRIDPILOT_LIVE_API !== '1')('connects the frontend client to live FastAPI', async () => {
  expect(await getHealth()).toEqual({ status: 'ok', project: 'GridPilot' })
  const scenario = readFileSync(new URL('../../../sample_data/scenario.demo.json', import.meta.url), 'utf8')
  await expect(apiRequest('/api/optimize', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: scenario,
  })).rejects.toMatchObject({ status: 501, body: { status: 'not_implemented' } } satisfies Partial<ApiError>)
})
