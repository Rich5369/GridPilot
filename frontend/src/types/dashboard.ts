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
export type ScenarioField = keyof Omit<ScenarioEditor, 'demandProfile'>
export interface DemandProfile {
  mode: 'demo' | 'custom'
  values: string[]
}
export interface ScenarioEditor {
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
