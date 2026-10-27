import type { Scenario } from '../types/api'
import type {
  EquipmentPowerSchedule,
  HourlyConsumption,
  ScenarioEditor,
  SimulationResult,
} from '../types/dashboard'

export const defaultEditor: ScenarioEditor = {
  opening: '8',
  closing: '18',
  limit: '25',
  offPeak: '0.12',
  peak: '0.28',
  peakStart: '14',
  peakEnd: '20',
  chargers: '2',
  chargerPower: '7.2',
  evEnergy: '14.4',
  arrival: '9',
  deadline: '17',
  equipmentPower: '3',
  duration: '2',
  equipmentStart: '10',
  equipmentEnd: '16',
}
export const background = Array<number>(24).fill(1.5)
export const hvac = [
  0, 0, 0, 0, 0, 0, 1, 2, 4, 5, 5, 6, 6, 6, 6, 5, 5, 4, 2, 1, 0, 0, 0, 0,
]

export function validateEditor(
  editor: ScenarioEditor,
): Partial<Record<keyof ScenarioEditor, string>> {
  const errors: Partial<Record<keyof ScenarioEditor, string>> = {}
  for (const key of Object.keys(editor) as (keyof ScenarioEditor)[]) {
    if (
      editor[key].trim() === '' ||
      !Number.isFinite(Number(editor[key])) ||
      Number(editor[key]) < 0
    )
      errors[key] = 'Enter a finite, nonnegative number.'
  }
  for (const key of ['limit', 'chargerPower', 'equipmentPower'] as const) {
    if (Number(editor[key]) <= 0) errors[key] = 'Must be greater than zero.'
  }
  for (const [start, end] of [
    ['opening', 'closing'],
    ['peakStart', 'peakEnd'],
    ['arrival', 'deadline'],
    ['equipmentStart', 'equipmentEnd'],
  ] as const) {
    const a = Number(editor[start]),
      b = Number(editor[end])
    if (!Number.isInteger(a) || a > 23)
      errors[start] = 'Use a whole hour from 0 to 23.'
    if (!Number.isInteger(b) || b < 1 || b > 24)
      errors[end] = 'Use a whole hour from 1 to 24.'
    if (b <= a)
      errors[end] =
        'End must follow start. Overnight windows are not supported.'
  }
  if (!Number.isInteger(Number(editor.chargers)) || Number(editor.chargers) > 2)
    errors.chargers = 'Choose 0, 1 or 2 chargers.'
  if (!Number.isFinite(Number(editor.duration) * Number(editor.equipmentPower)))
    errors.duration = 'Required equipment energy is too large.'
  return errors
}

export function feasibilityWarnings(editor: ScenarioEditor): string[] {
  const warnings: string[] = []
  if (
    Number(editor.chargers) > 0 &&
    Number(editor.evEnergy) >
      Number(editor.chargerPower) *
        (Number(editor.deadline) - Number(editor.arrival))
  )
    warnings.push(
      'Each EV requires more energy than its power and availability window allow. Requirements are preserved for the solver to evaluate.',
    )
  if (
    Number(editor.duration) >
    Number(editor.equipmentEnd) - Number(editor.equipmentStart)
  )
    warnings.push(
      'Equipment duration exceeds its allowed window. Requirements are preserved for the solver to evaluate.',
    )
  if (Math.max(...background.map((v, h) => v + hvac[h])) > Number(editor.limit))
    warnings.push(
      'Predetermined background + HVAC demand exceeds the building limit. The future solver must report feasibility.',
    )
  return warnings
}

export function toScenario(editor: ScenarioEditor): Scenario {
  if (Object.keys(validateEditor(editor)).length)
    throw new Error('Correct the configuration errors before submitting.')
  const n = (key: keyof ScenarioEditor) => Number(editor[key])
  return {
    operating_hours: { start_hour: n('opening'), end_hour: n('closing') },
    building_max_demand_kw: n('limit'),
    fixed_demand_kw: background.map((v, h) => v + hvac[h]),
    electricity_prices_usd_per_kwh: Array.from({ length: 24 }, (_, h) =>
      h >= n('peakStart') && h < n('peakEnd') ? n('peak') : n('offPeak'),
    ),
    ev_requirements: Array.from({ length: n('chargers') }, (_, i) => ({
      id: `office-ev-${i + 1}`,
      arrival_hour: n('arrival'),
      deadline_hour: n('deadline'),
      energy_required_kwh: n('evEnergy'),
      max_charging_power_kw: n('chargerPower'),
    })),
    flexible_equipment: [
      {
        id: 'office-equipment',
        available_hours: {
          start_hour: n('equipmentStart'),
          end_hour: n('equipmentEnd'),
        },
        energy_required_kwh: n('duration') * n('equipmentPower'),
        max_power_kw: n('equipmentPower'),
      },
    ],
  }
}

// Explicit, predetermined fixture schedules. This is not a simulator or optimizer.
export const demoSchedules: EquipmentPowerSchedule[] = [
  {
    id: 'office-ev-1',
    power_kw: Array.from({ length: 24 }, (_, h) =>
      h === 9 || h === 10 ? 7.2 : 0,
    ),
  },
  {
    id: 'office-ev-2',
    power_kw: Array.from({ length: 24 }, (_, h) =>
      h === 9 || h === 10 ? 7.2 : 0,
    ),
  },
  {
    id: 'office-equipment',
    power_kw: Array.from({ length: 24 }, (_, h) =>
      h === 10 || h === 11 ? 3 : 0,
    ),
  },
]
export const demoScenario = toScenario(defaultEditor)
export const demoHours: HourlyConsumption[] = Array.from(
  { length: 24 },
  (_, hour) => {
    const ev = demoSchedules[0].power_kw[hour] + demoSchedules[1].power_kw[hour]
    const flexible = demoSchedules[2].power_kw[hour]
    const total = background[hour] + hvac[hour] + ev + flexible
    const price = demoScenario.electricity_prices_usd_per_kwh[hour]
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      background: background[hour],
      hvac: hvac[hour],
      ev,
      flexible,
      total,
      price,
      energyKwh: total * 1,
      energyCostUsd: total * 1 * price,
    }
  },
)
export const demoResult: SimulationResult = {
  source: 'demo',
  scenario: demoScenario,
  hours: demoHours,
  energyKwh: demoHours.reduce((sum, h) => sum + h.energyKwh, 0),
  energyCostUsd: demoHours.reduce((sum, h) => sum + h.energyCostUsd, 0),
  peakKw: Math.max(...demoHours.map((h) => h.total)),
}
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Math.abs(value) < 0.005 ? 0 : value,
  )
