import { describe, expect, it } from 'vitest'
import {
  defaultEditor,
  demoResult,
  fixedDemand,
  sourceCategories,
  toScenario,
  validateEditor,
} from './demoScenario'
import type { ScenarioEditor } from '../types/dashboard'
const editor = (): ScenarioEditor => ({
  ...defaultEditor,
  demandProfile: {
    mode: 'sources',
    values: Array(24).fill('99'),
    sources: [
      {
        category: sourceCategories[0],
        values: Array.from({ length: 24 }, (_, h) => String(h / 10)),
      },
      { category: sourceCategories[1], values: Array(24).fill('2') },
    ],
  },
})
describe('commercial fixed sources', () => {
  it('replaces combined demand and sends only the existing Scenario contract', () => {
    const e = editor(),
      payload = toScenario(e)
    expect(payload.fixed_demand_kw).toEqual(
      Array.from({ length: 24 }, (_, h) => h / 10 + 2),
    )
    expect(payload).not.toHaveProperty('sources')
    expect(payload).not.toHaveProperty('demandProfile')
    expect(payload.ev_requirements).toEqual(
      toScenario(defaultEditor).ev_requirements,
    )
    expect(payload.flexible_equipment).toEqual(
      toScenario(defaultEditor).flexible_equipment,
    )
    expect(fixedDemand(e).reduce((a, b) => a + b, 0)).toBeCloseTo(75.6)
  })
  it('preserves demo totals and custom values across mode changes', () => {
    expect(demoResult.energyKwh).toBeCloseTo(128.8)
    expect(demoResult.energyCostUsd).toBeCloseTo(20.576)
    expect(demoResult.peakKw).toBeCloseTo(23.9)
    const e = editor()
    e.demandProfile!.mode = 'custom'
    expect(fixedDemand(e)).toEqual(Array(24).fill(99))
    e.demandProfile!.mode = 'demo'
    expect(fixedDemand(e)).toEqual(toScenario(defaultEditor).fixed_demand_kw)
  })
  it('rejects absent, duplicate, invalid and overflowing sources', () => {
    const variants = [
      [],
      [{ category: 'Invented', values: Array(24).fill('1') }],
      [
        editor().demandProfile!.sources![0],
        editor().demandProfile!.sources![0],
      ],
      [{ category: sourceCategories[0], values: ['2'] }],
      [{ category: sourceCategories[0], values: Array(24).fill('') }],
      [{ category: sourceCategories[0], values: Array(24).fill('-1') }],
      sourceCategories
        .slice(0, 2)
        .map((category) => ({ category, values: Array(24).fill('1e308') })),
    ]
    for (const sources of variants) {
      const e = editor()
      e.demandProfile!.sources = sources
      expect(validateEditor(e).demandProfile).toBeTruthy()
      expect(() => toScenario(e)).toThrow()
    }
  })
  it('allows vehicle charging to be omitted independently', () => {
    expect(toScenario({ ...editor(), chargers: '0' }).ev_requirements).toEqual(
      [],
    )
  })
})
