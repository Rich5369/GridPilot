// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import snapshot from '../../../../backend/eia/commercial_snapshot.json'
import { ElectricityPriceExplorer } from './ElectricityPriceExplorer'
import { apiRequest } from '../../services/api'
vi.mock('../../services/api', () => ({ apiRequest: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('shows dated EIA commercial data, state selection and a separate price-free wholesale directory', async () => {
  vi.mocked(apiRequest).mockResolvedValue(snapshot)
  const container = document.createElement('div'), root = createRoot(container)
  await act(async () => root.render(<ElectricityPriceExplorer />))
  expect(container.textContent).toContain('August 2026')
  expect(container.querySelector('.market-price')?.textContent).toContain('30.02')
  expect(container.textContent).toContain('Published monthly · not live')
  expect(container.textContent).toContain('Oct 23, 2026')
  expect(container.textContent).toContain('They do not update optimizer inputs')
  await act(async () => container.querySelector('[aria-label="Select Texas"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(container.querySelector('.market-price')?.textContent).toContain('8.96')
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Wholesale market directory')!.click())
  expect(container.textContent).toContain('Wholesale observations are withheld')
  expect(container.textContent).toContain('No connected price feed')
  expect(container.querySelector('.market-price')?.textContent).toContain('—')
  expect(vi.mocked(apiRequest).mock.calls.every(([path]) => path === '/api/retail-prices')).toBe(true)
  await act(async () => root.unmount())
})
it('never invents a retail price when the backend is unreachable', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new TypeError('offline'))
  const container = document.createElement('div'), root = createRoot(container)
  await act(async () => root.render(<ElectricityPriceExplorer />))
  expect(container.textContent).toContain('Data unavailable')
  expect(container.querySelector('.market-price')?.textContent).toContain('—')
  await act(async () => root.unmount())
})
