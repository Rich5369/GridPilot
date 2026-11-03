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

describe('backend connection status', () => {
  it('calls the health endpoint and shows connected', async () => {
    fetchMock.mockResolvedValue(healthy())
    await act(async () => root.render(<BackendStatus />))
    expect(container.textContent).toContain('Backend connected')
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8000/api/health')
  })
  it('handles a network failure and recovers on retry', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(healthy())
    await act(async () => root.render(<BackendStatus />))
    expect(container.textContent).toContain('Backend unavailable')
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toContain('Backend connected')
  })
  it('treats an unexpected health response as offline', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok', project: 'Other' })))
    await act(async () => root.render(<BackendStatus />))
    expect(container.textContent).toContain('Backend unavailable')
  })
  it('times out an unresponsive backend', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
      await act(async () => root.render(<BackendStatus />))
      expect(container.textContent).toContain('Connecting to backend')
      await act(async () => { vi.advanceTimersByTime(60000) })
      expect(container.textContent).toContain('Backend unavailable')
      await act(async () => { vi.advanceTimersByTime(120000) })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})

it.each([35000, 45000])('recovers after a %i ms cold start with one health request', async (delay) => {
  vi.useFakeTimers()
  try {
    fetchMock.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(healthy()), delay)))
    await act(async () => root.render(<BackendStatus />))
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(container.textContent).toContain('Backend waking up')
    expect(container.querySelector('button')!.disabled).toBe(true)
    await act(async () => { vi.advanceTimersByTime(delay - 5000) })
    expect(container.textContent).toContain('Backend connected')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally { vi.useRealTimers() }
})
