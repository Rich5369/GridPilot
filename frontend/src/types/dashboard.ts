import type { HourWindow, Scenario, OptimizationResult } from './api'

// UI-only tariff editor; toScenario is the single adapter to the API contract.
export interface ElectricityTariff {
  offPeak: number
  peak: number
  peakWindow: HourWindow
}
export interface BuildingConfiguration {
  operating_hours: HourWindow
  building_max_demand_kw: number
}
export interface EquipmentPowerSchedule {
  id: string
  power_kw: number[]
}
export interface HourlyConsumption {
  hour: number
  label: string
  background: number
  hvac: number
  ev: number
  flexible: number
  total: number
  price: number
  energyKwh: number
  energyCostUsd: number
}
export type FeasibilityStatus =
  OptimizationResult['feasibility_status'] | 'not_evaluated'
export interface SimulationResult {
  source: 'demo' | 'simulation'
  scenario: Scenario
  hours: HourlyConsumption[]
  energyKwh: number
  energyCostUsd: number
  peakKw: number
}
export type ScenarioField = keyof Omit<
  ScenarioEditor,
  'demandProfile' | 'analysisChoice' | 'customEquipment'
>
export interface DemandProfile {
  mode: 'demo' | 'custom' | 'sources'
  values: string[]
  sources?: { category: string; values: string[] }[]
}
export type AnalysisChoice = 'building' | 'flexible' | 'ev' | 'joint' | 'held'
export interface CustomEquipment {
  id: 'custom-equipment'
  name: string
  description: string
  kind: 'context' | 'fixed' | 'schedulable'
  energy: string
  power: string
  start: string
  end: string
  interruptible: boolean
}
export interface ScenarioEditor {
  analysisChoice?: AnalysisChoice
  customEquipment?: CustomEquipment
  demandProfile?: DemandProfile
  opening: string
  closing: string
  limit: string
  offPeak: string
  peak: string
  peakStart: string
  peakEnd: string
  chargers: string
  chargerPower: string
  evEnergy: string
  arrival: string
  deadline: string
  equipmentPower: string
  duration: string
  equipmentStart: string
  equipmentEnd: string
}
