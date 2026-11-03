// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendStatus } from './BackendStatus'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
const healthy = () => new Response(JSON.stringify({ status: 'ok', project: 'GridPilot' }))

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
