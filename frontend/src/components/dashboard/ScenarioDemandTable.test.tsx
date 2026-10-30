// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ScenarioDemandTable } from './ScenarioDemandTable'
import { defaultEditor } from '../../data/demoScenario'
import type { ScenarioEditor } from '../../types/dashboard'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement, root: Root
beforeEach(() => { container = document.createElement('div'); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()) })
async function render(editor: ScenarioEditor) {
  await act(async () => root.render(<ScenarioDemandTable editor={editor} label="Submitted snapshot" />))
}
it('shows every custom entry, preserving zero and entered precision with hour and unit labels', async () => {
  const values = Array.from({ length: 24 }, (_, hour) => String(hour / 8))
  values[12] = '1.23456789'
  await render({ ...defaultEditor, demandProfile: { mode: 'custom', values } })
  const rows = [...container.querySelectorAll('tbody tr')]
  expect(rows).toHaveLength(24)
  expect(rows.map(row => row.querySelector('td')!.textContent)).toEqual(values)
  expect(rows[0].querySelector('th')!.textContent).toBe('00:00–01:00')
  expect(rows[23].querySelector('th')!.textContent).toBe('23:00–24:00')
  expect(container.querySelector('caption')!.textContent).toContain('Submitted snapshot · Custom fixed-demand inputs · kW')
  expect(container.querySelector('[role="region"]')!.getAttribute('tabindex')).toBe('0')
  expect(container.querySelectorAll('tbody th[scope="row"]')).toHaveLength(24)
})
it('labels named sources separately and displays the submitted combined demand', async () => {
  await render({ ...defaultEditor, demandProfile: { mode: 'sources', values: [], sources: [
    { category: 'Lighting', values: Array(24).fill('2') },
    { category: 'Refrigeration', values: Array(24).fill('1.25') },
  ] } })
  expect([...container.querySelectorAll('thead th')].map(th => th.textContent)).toEqual([
    'Building-local hour', 'Lighting (kW)', 'Refrigeration (kW)', 'Combined fixed demand (kW)',
  ])
  for (const row of container.querySelectorAll('tbody tr')) {
    expect([...row.querySelectorAll('td')].map(td => td.textContent)).toEqual(['2', '1.25', '3.25'])
  }
})
it('does not turn an incomplete draft value into a displayed zero', async () => {
  await render({ ...defaultEditor, demandProfile: { mode: 'custom', values: Array(24).fill('') } })
  expect(container.querySelector('table')).toBeNull()
  expect(container.textContent).toContain('unavailable until the draft profile is complete')
})
it('does not present demo defaults as custom submitted inputs', async () => {
  await render(defaultEditor)
  expect(container.querySelector('table')).toBeNull()
})
