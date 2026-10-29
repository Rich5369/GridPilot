import { describe, expect, it } from 'vitest'
import {
  defaultEditor,
  demoResult,
  demoSchedules,
  feasibilityWarnings,
  toScenario,
  validateEditor,
} from './demoScenario'
import { calculateCosts } from '../components/dashboard/CostBreakdown'
describe('deterministic office fixture', () => {
  it('has 24 contiguous intervals with consistent power, energy and cost', () => {
    expect(demoResult.hours.map((h) => h.hour)).toEqual(
      Array.from({ length: 24 }, (_, i) => i),
    )
    demoResult.hours.forEach((h) => {
      expect(h.total).toBeCloseTo(h.background + h.hvac + h.ev + h.flexible)
      expect(h.energyKwh).toBeCloseTo(h.total * 1)
      expect(h.energyCostUsd).toBeCloseTo(h.total * 1 * h.price)
    })
    expect(demoResult.energyKwh).toBeCloseTo(128.8)
    expect(demoResult.energyCostUsd).toBeCloseTo(20.576)
    expect(demoResult.peakKw).toBeCloseTo(23.9)
  })
  it('delivers exactly the requested EV and equipment energy within windows', () => {
    for (const ev of demoResult.scenario.ev_requirements) {
      const schedule = demoSchedules.find((s) => s.id === ev.id)!.power_kw
      expect(schedule.reduce((a, b) => a + b)).toBeCloseTo(
        ev.energy_required_kwh,
      )
      schedule.forEach((v, h) => {
        expect(v).toBeLessThanOrEqual(ev.max_charging_power_kw)
        if (h < ev.arrival_hour || h >= ev.deadline_hour) expect(v).toBe(0)
      })
    }
    expect(demoSchedules[2].power_kw.reduce((a, b) => a + b)).toBe(6)
  })
})
describe('scenario adapter and validation', () => {
  it('adapts tariffs, charger count, duration and fixed demand without extra API fields', () => {
    const scenario = toScenario({
      ...defaultEditor,
      chargers: '1',
      duration: '2.5',
    })
    expect(scenario.ev_requirements).toHaveLength(1)
    expect(scenario.flexible_equipment![0].energy_required_kwh).toBe(7.5)
    expect(scenario.electricity_prices_usd_per_kwh.slice(14, 20)).toEqual(
      Array(6).fill(0.28),
    )
    expect(scenario.electricity_prices_usd_per_kwh[20]).toBe(0.12)
    expect(scenario.fixed_demand_kw[10]).toBe(6.5)
    expect(
      toScenario({ ...defaultEditor, chargers: '0' }).ev_requirements,
    ).toEqual([])
  })
  it.each([
    ['limit', '-1'],
    ['limit', '0'],
    ['offPeak', ''],
    ['peak', 'NaN'],
    ['arrival', '8.5'],
    ['closing', '25'],
    ['opening', '-1'],
    ['chargers', '3'],
    ['chargers', '1.2'],
    ['duration', '-2'],
  ])('rejects invalid %s = %s', (key, value) => {
    const editor = { ...defaultEditor, [key]: value }
    expect(Object.keys(validateEditor(editor)).length).toBeGreaterThan(0)
    expect(() => toScenario(editor)).toThrow()
  })
  it('rejects overnight/equal windows but accepts midnight end', () => {
    expect(
      validateEditor({ ...defaultEditor, arrival: '22', deadline: '6' })
        .deadline,
    ).toContain('Overnight')
    expect(
      validateEditor({ ...defaultEditor, peakStart: '8', peakEnd: '8' })
        .peakEnd,
    ).toBeTruthy()
    expect(validateEditor({ ...defaultEditor, closing: '24' })).toEqual({})
  })
  it('preserves infeasible mandatory requirements for future solver evaluation', () => {
    const editor = { ...defaultEditor, evEnergy: '1000', duration: '20' }
    expect(validateEditor(editor)).toEqual({})
    expect(feasibilityWarnings(editor)).toHaveLength(2)
    expect(toScenario(editor).ev_requirements[0].energy_required_kwh).toBe(1000)
  })
})
it('keeps billing-period demand exposure separate from daily energy costs', () => {
  expect(calculateCosts(20, 2, null, null, 30)).toEqual({
    demand: null,
    dailyAllocation: null,
    total: 22,
  })
  expect(calculateCosts(20, 2, 12, 40, 30)).toEqual({
    demand: 480,
    dailyAllocation: 16,
    total: 38,
  })
  expect(calculateCosts(20, 0, 0, 40, 30).demand).toBe(0)
})


it('does not display negative zero for sub-cent solver differences', async () => {
  const { money } = await import('./demoScenario')
  expect(money(-0.0000001)).toBe('$0.00')
  expect(money(-0.01)).toBe('-$0.01')
})

describe('custom fixed demand', () => {
  const profile = Array.from({ length: 24 }, (_, hour) => String(hour / 4))
  it('replaces combined demo loads exactly, without changing tariffs or equipment', () => {
    const original = toScenario(defaultEditor)
    const custom = toScenario({ ...defaultEditor, demandProfile: { mode: 'custom', values: profile } })
    expect(custom).toEqual({ ...original, fixed_demand_kw: profile.map(Number) })
    expect(custom.fixed_demand_kw[0]).toBe(0)
    expect(custom.fixed_demand_kw[10]).toBe(2.5)
    expect(profile[10]).toBe('2.5')
    expect(toScenario({ ...defaultEditor, demandProfile: { mode: 'demo', values: profile } })).toEqual(original)
  })
  it.each(['', '-1', 'NaN', 'Infinity', '1e999'])('rejects invalid hourly input %s', value => {
    const values = [...profile]; values[12] = value
    const editor = { ...defaultEditor, demandProfile: { mode: 'custom' as const, values } }
    expect(validateEditor(editor).demandProfile).toBeTruthy()
    expect(() => toScenario(editor)).toThrow()
  })
  it.each([0, 23, 25])('rejects %i hourly values', length => {
    expect(() => toScenario({ ...defaultEditor, demandProfile: { mode: 'custom', values: Array(length).fill('1') } })).toThrow()
  })
  it('uses custom values for fixed-load feasibility warnings', () => {
    const editor = { ...defaultEditor, demandProfile: { mode: 'custom' as const, values: Array(24).fill('30') } }
    expect(feasibilityWarnings(editor)).toEqual([expect.stringContaining('Fixed demand exceeds')])
    expect(toScenario(editor).fixed_demand_kw).toEqual(Array(24).fill(30))
  })
})
