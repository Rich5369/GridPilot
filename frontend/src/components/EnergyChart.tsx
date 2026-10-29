import type { SimulationResult } from '../types/dashboard'
import { DemandChart } from './DemandChart'
export function EnergyChart({ result }: { result: SimulationResult }) {
  const series = (
    key: 'background' | 'hvac' | 'ev' | 'flexible',
    label: string,
  ) => ({ key, label, values: result.hours.map((h) => h[key]) })
  const sources =
    result.source === 'demo'
      ? [
          series('background', 'Unallocated building demand · fixed'),
          series('hvac', 'Heating, cooling and ventilation · fixed'),
          series('ev', 'Vehicle charging · schedulable'),
          series('flexible', 'Shiftable equipment'),
        ]
      : [
          {
            key: 'fixed',
            label: 'Combined / unallocated fixed demand',
            values: result.scenario.fixed_demand_kw,
          },
          series('ev', 'Vehicle charging'),
          series('flexible', 'Shiftable equipment'),
        ]
  return (
    <section className="panel chart-panel" aria-labelledby="energy-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">24-HOUR LOAD PROFILE</p>
          <h2 id="energy-title">Building electricity demand</h2>
        </div>
        <span className="tag">
          {result.source === 'demo' ? 'DEMO DATA' : 'SIMULATION'}
        </span>
      </div>
      <DemandChart
        total={{
          key: 'total',
          label: 'Total demand',
          values: result.hours.map((h) => h.total),
        }}
        sources={sources.filter((s) => s.values.some((v) => v > 0))}
        limit={result.scenario.building_max_demand_kw}
      />
      <div className="chart-footer">
        <span>24 × 1-hour intervals · 00:00–24:00</span>
        <span>Fixed building demand cannot be optimized</span>
      </div>
    </section>
  )
}
