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
    expect(container.textContent).toContain('Backend offline')
    await act(async () => container.querySelector('button')!.click())
    expect(container.textContent).toContain('Backend connected')
  })
  it('treats an unexpected health response as offline', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok', project: 'Other' })))
    await act(async () => root.render(<BackendStatus />))
    expect(container.textContent).toContain('Backend offline')
  })
  it('times out an unresponsive backend', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      }))
      await act(async () => root.render(<BackendStatus />))
      expect(container.textContent).toContain('Checking backend')
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(container.textContent).toContain('Backend offline')
    } finally { vi.useRealTimers() }
  })
})
