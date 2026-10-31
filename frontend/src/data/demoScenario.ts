import { includesEV, includesFlexible } from './analysisOptions'
import type { Scenario } from '../types/api'
import type {
  EquipmentPowerSchedule,
  HourlyConsumption,
  ScenarioEditor,
  ScenarioField,
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

export const sourceCategories = [
  'Heating, cooling and ventilation',
  'Lighting',
  'Refrigeration',
  'Computers and electronics',
  'Kitchen and water heating',
  'Other building equipment',
]

export function fixedDemand(editor: ScenarioEditor): number[] {
  if (editor.demandProfile?.mode === 'sources')
    return Array.from({ length: 24 }, (_, h) =>
      (editor.demandProfile?.sources ?? []).reduce(
        (sum, source) => sum + Number(source.values[h]),
        0,
      ),
    )
  return editor.demandProfile?.mode === 'custom'
    ? editor.demandProfile.values.map(Number)
    : background.map((v, h) => v + hvac[h])
}

export function demandProfileErrors(editor: ScenarioEditor): string[] {
  if (editor.demandProfile?.mode === 'sources') {
    const sources = editor.demandProfile.sources ?? []
    if (!sources.length) return ['Add at least one fixed-demand source.']
    if (new Set(sources.map((s) => s.category)).size !== sources.length)
      return ['Use each category once.']
    if (sources.some((s) => !sourceCategories.includes(s.category)))
      return ['Choose a supported source category.']
    const errors = sources.flatMap((source) =>
      demandProfileErrors({
        ...editor,
        demandProfile: { mode: 'custom', values: source.values },
      }),
    )
    if (!fixedDemand(editor).every(Number.isFinite))
      errors.push('Combined source demand must be finite.')
    return errors
  }
  if (editor.demandProfile?.mode !== 'custom') return []
  const values = editor.demandProfile.values
  if (values.length !== 24) return ['Enter exactly 24 hourly values.']
  return values.map((value) =>
    value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0
      ? 'Enter a finite, nonnegative demand in kW.'
      : '',
  )
}

export function profileSource(editor: ScenarioEditor): string {
  if (editor.demandProfile?.mode === 'sources')
    return 'User-configured named fixed-demand sources · manually entered, not verified meter data'
  return editor.demandProfile?.mode === 'custom'
    ? 'User-configured fixed demand · manually entered, not verified meter data'
    : 'Demonstration fixed demand · predetermined background + HVAC'
}

export function validateEditor(
  editor: ScenarioEditor,
): Partial<Record<keyof ScenarioEditor, string>> {
  const errors: Partial<Record<keyof ScenarioEditor, string>> = {}
  const active = (key: ScenarioField) =>
    !(
      ['chargerPower', 'evEnergy', 'arrival', 'deadline'].includes(key) &&
      (!includesEV(editor) || Number(editor.chargers) === 0)
    ) &&
    !(
      ['equipmentPower', 'duration', 'equipmentStart', 'equipmentEnd'].includes(
        key,
      ) &&
      (!includesFlexible(editor) ||
        (key !== 'duration' && Number(editor.duration) === 0))
    ) &&
    !(key === 'chargers' && !includesEV(editor))
  for (const key of Object.keys(defaultEditor) as ScenarioField[]) {
    if (!active(key)) continue
    if (
      editor[key].trim() === '' ||
      !Number.isFinite(Number(editor[key])) ||
      Number(editor[key]) < 0
    )
      errors[key] = 'Enter a finite, nonnegative number.'
  }
  for (const key of ['limit', 'chargerPower', 'equipmentPower'] as const) {
    if (active(key) && Number(editor[key]) <= 0)
      errors[key] = 'Must be greater than zero.'
  }
  for (const [start, end] of [
    ['opening', 'closing'],
    ['peakStart', 'peakEnd'],
    ['arrival', 'deadline'],
    ['equipmentStart', 'equipmentEnd'],
  ] as const) {
    if (!active(start)) continue
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
  if (
    includesEV(editor) &&
    (!Number.isInteger(Number(editor.chargers)) || Number(editor.chargers) > 2)
  )
    errors.chargers = 'Choose 0, 1 or 2 chargers.'
  if (
    includesFlexible(editor) &&
    !Number.isFinite(Number(editor.duration) * Number(editor.equipmentPower))
  )
    errors.duration = 'Required equipment energy is too large.'
  if (demandProfileErrors(editor).some(Boolean))
    errors.demandProfile = 'Correct the hourly fixed-demand values.'
  const c = editor.customEquipment
  if (
    c &&
    (!c.name.trim() || c.name.length > 100 || c.description.length > 500)
  )
    errors.customEquipment =
      'Give custom equipment a name (up to 100 characters); description is optional (up to 500).'
  if (c?.kind === 'schedulable' && includesFlexible(editor)) {
    if (
      !c.interruptible ||
      [c.energy, c.power].some(
        (v) => v.trim() === '' || !Number.isFinite(Number(v)) || Number(v) <= 0,
      ) ||
      ![c.start, c.end].every(
        (v) => v.trim() !== '' && Number.isInteger(Number(v)),
      ) ||
      Number(c.start) < 0 ||
      Number(c.start) > 23 ||
      Number(c.end) > 24 ||
      Number(c.end) <= Number(c.start)
    )
      errors.customEquipment =
        'Provide positive energy (kWh), maximum power (kW), a same-day whole-hour window, and confirm interruptible operation. Overnight operation is not supported.'
  }
  return errors
}

export function feasibilityWarnings(editor: ScenarioEditor): string[] {
  const warnings: string[] = []
  if (
    includesEV(editor) &&
    Number(editor.chargers) > 0 &&
    Number(editor.evEnergy) >
      Number(editor.chargerPower) *
        (Number(editor.deadline) - Number(editor.arrival))
  )
    warnings.push(
      'Each EV requires more energy than its power and availability window allow. Requirements are preserved for the solver to evaluate.',
    )
  if (
    includesFlexible(editor) &&
    Number(editor.duration) >
      Number(editor.equipmentEnd) - Number(editor.equipmentStart)
  )
    warnings.push(
      'Equipment duration exceeds its allowed window. Requirements are preserved for the solver to evaluate.',
    )
  if (Math.max(...fixedDemand(editor)) > Number(editor.limit))
    warnings.push(
      'Fixed demand exceeds the building limit. The optimizer cannot reduce fixed demand; adjust the profile or site limit.',
    )
  return warnings
}

export function toScenario(editor: ScenarioEditor): Scenario {
  if (Object.keys(validateEditor(editor)).length)
    throw new Error('Correct the configuration errors before submitting.')
  const n = (key: ScenarioField) => Number(editor[key])
  return {
    operating_hours: { start_hour: n('opening'), end_hour: n('closing') },
    building_max_demand_kw: n('limit'),
    fixed_demand_kw: fixedDemand(editor),
    electricity_prices_usd_per_kwh: Array.from({ length: 24 }, (_, h) =>
      h >= n('peakStart') && h < n('peakEnd') ? n('peak') : n('offPeak'),
    ),
    ev_requirements: Array.from(
      { length: includesEV(editor) ? n('chargers') : 0 },
      (_, i) => ({
        id: `office-ev-${i + 1}`,
        arrival_hour: n('arrival'),
        deadline_hour: n('deadline'),
        energy_required_kwh: n('evEnergy'),
        max_charging_power_kw: n('chargerPower'),
      }),
    ),
    flexible_equipment: [
      ...(includesFlexible(editor) && n('duration') > 0
        ? [
            {
              id: 'office-equipment',
              available_hours: {
                start_hour: n('equipmentStart'),
                end_hour: n('equipmentEnd'),
              },
              energy_required_kwh: n('duration') * n('equipmentPower'),
              max_power_kw: n('equipmentPower'),
            },
          ]
        : []),
      ...(includesFlexible(editor) &&
      editor.customEquipment?.kind === 'schedulable'
        ? [
            {
              id: editor.customEquipment.id,
              available_hours: {
                start_hour: Number(editor.customEquipment.start),
                end_hour: Number(editor.customEquipment.end),
              },
              energy_required_kwh: Number(editor.customEquipment.energy),
              max_power_kw: Number(editor.customEquipment.power),
            },
          ]
        : []),
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
