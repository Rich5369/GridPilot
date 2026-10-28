// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Dashboard } from './Dashboard'
vi.mock('../components/EnergyChart', () => ({
  EnergyChart: () => <div>24-hour chart</div>,
}))
vi.mock('../components/dashboard/Comparison', () => ({
  Comparison: ({ result }: { result: unknown }) => (
    <div>{result ? 'Backend result' : 'No optimization result yet'}</div>
  ),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root
const fetchMock = vi.fn()
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ status: 'ok', project: 'GridPilot' })),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})
async function click(label: string) {
  const b = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  )!
  expect(b).toBeTruthy()
  await act(async () => b.click())
}
async function input(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
it('edits, validates and resets the draft without changing demo results', async () => {
  await act(async () => root.render(<Dashboard />))
  expect(container.textContent).toContain('128.8')
  await click('Scenario configuration')
  await input('limit', '12')
  expect(container.textContent).toContain('12 kW limit')
  await input('deadline', '6')
  expect(
    container.querySelector('#deadline')!.getAttribute('aria-invalid'),
  ).toBe('true')
  expect(
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Run optimization',
    )!.disabled,
  ).toBe(true)
  await click('Reset to Default Scenario')
  expect(container.querySelector<HTMLInputElement>('#limit')!.value).toBe('25')
  await input('limit', '15')
  await click('Energy overview')
  expect(container.textContent).toContain('128.8')
  expect(container.textContent).toContain(
    'Charts and costs retain the original fixture',
  )
})
it('displays HTTP 501 clearly and never claims solver success', async () => {
  await act(async () => root.render(<Dashboard />))
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ status: 'not_implemented' }), {
      status: 501,
    }),
  )
  await click('Run optimization')
  expect(container.textContent).toContain('No calculations were performed')
  expect(container.textContent).not.toContain('Backend result received')
  expect(container.textContent).toContain('No optimization result yet')
  await click('AI assistant')
  expect(container.textContent).toContain('LIVE VERIFICATION PENDING')
})

it('shows loading, prevents repeat submissions and recovers after failure', async () => {
  await act(async () => root.render(<Dashboard />))
  let rejectRequest!: (error: Error) => void
  fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject }))
  const run = [...container.querySelectorAll('button')].find(b => b.textContent === 'Run optimization')!
  await act(async () => { run.click(); run.click() })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/optimize'))).toHaveLength(1)
  expect(run.disabled).toBe(true)
  expect(run.getAttribute('aria-busy')).toBe('true')
  expect(container.textContent).toContain('up to 45 seconds')
  await act(async () => rejectRequest(new DOMException('expired', 'TimeoutError')))
  expect(run.disabled).toBe(false)
  expect(container.textContent).toContain('timed out after 45 seconds')
  expect(container.textContent).toContain('No optimization result yet')
})
