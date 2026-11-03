// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BackendStatus } from './BackendStatus'
import { getHealth } from '../services/api'

vi.mock('../services/api', () => ({ getHealth: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const health = vi.mocked(getHealth)
let container: HTMLDivElement, root: Root
const ok = { status: 'ok', project: 'GridPilot' } as const
beforeEach(() => {
  vi.useFakeTimers()
  health.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
})
const render = () => act(async () => root.render(<BackendStatus />))
const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms))
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === text)!
  expect(button).toBeTruthy()
  await act(async () => button.click())
}

it.each([45_000, 60_000])('connects automatically after a %i ms cold start without failing at five seconds', async delay => {
  health.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(ok), delay)))
  await render()
  expect(container.textContent).toContain('Connecting to backend')
  await advance(5_000)
  expect(container.textContent).toContain('Waiting for backend to wake up')
  expect(container.textContent).not.toContain('offline')
  expect(health.mock.calls[0][0]!.aborted).toBe(false)
  await advance(delay - 5_000)
  expect(container.textContent).toContain('Backend connected')
  expect(health).toHaveBeenCalledTimes(1)
  await advance(120_000)
  expect(health).toHaveBeenCalledTimes(1)
})

it('retries failed read-only health checks sequentially and recovers within the original budget', async () => {
  health.mockRejectedValueOnce(new TypeError('network unavailable'))
    .mockRejectedValueOnce(new Error('HTTP 503'))
    .mockResolvedValue(ok)
  await render()
  await advance(3_000)
  expect(health).toHaveBeenCalledTimes(2)
  await advance(3_000)
  expect(container.textContent).toContain('Backend connected')
  expect(health).toHaveBeenCalledTimes(3)
  await advance(90_000)
  expect(health).toHaveBeenCalledTimes(3)
})

it('stops after 90 seconds despite repeated errors and requires explicit retry for a new budget', async () => {
  health.mockRejectedValue(new TypeError('network unavailable'))
  await render()
  await advance(90_000)
  expect(container.textContent).toContain('Backend connection timed out')
  expect(container.textContent).toContain('Your inputs are retained')
  const count = health.mock.calls.length
  await advance(180_000)
  expect(health).toHaveBeenCalledTimes(count)
  health.mockResolvedValue(ok)
  await click('Retry backend connection')
  expect(container.textContent).toContain('Backend connected')
  expect(health).toHaveBeenCalledTimes(count + 1)
})

it('aborts a hung health request at the deadline and ignores late success', async () => {
  health.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(ok), 100_000)))
  await render()
  const signal = health.mock.calls[0][0]!
  await advance(90_000)
  expect(signal.aborted).toBe(true)
  expect(container.textContent).toContain('Backend connection timed out')
  await advance(10_000)
  expect(container.textContent).toContain('Backend connection timed out')
  expect(health).toHaveBeenCalledTimes(1)
})

it('cancels without losing the retry control or letting an old request overwrite recovery', async () => {
  let finish!: (value: typeof ok) => void
  health.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  const oldSignal = health.mock.calls[0][0]!
  await click('Stop connection check')
  expect(oldSignal.aborted).toBe(true)
  expect(container.textContent).toContain('Connection check paused')
  await advance(120_000)
  expect(health).toHaveBeenCalledTimes(1)
  health.mockResolvedValue(ok)
  await click('Retry backend connection')
  expect(container.textContent).toContain('Backend connected')
  await act(async () => finish(ok))
  expect(container.textContent).toContain('Backend connected')
  expect(health).toHaveBeenCalledTimes(2)
})

it('aborts and clears timers on unmount', async () => {
  health.mockRejectedValue(new Error('network unavailable'))
  await render()
  const signal = health.mock.calls[0][0]!
  await act(async () => root.unmount())
  expect(signal.aborted).toBe(true)
  await advance(120_000)
  expect(health).toHaveBeenCalledTimes(1)
  // afterEach owns the final root teardown.
  root = createRoot(container)
})
