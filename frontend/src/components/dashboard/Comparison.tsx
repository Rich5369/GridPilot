import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GitCompareArrows } from 'lucide-react'
import type { OptimizationResult } from '../../types/api'
import { money } from '../../data/demoScenario'
export function Comparison({
  result,
  stale,
}: {
  result: OptimizationResult | null
  stale: boolean
}) {
  return (
    <section className="panel comparison">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BASELINE VS. OPTIMIZED</p>
          <h2>Optimization comparison</h2>
        </div>
        <span className="tag">
          {result ? 'BACKEND RESULT' : 'AWAITING SOLVER'}
        </span>
      </div>
      {!result ? (
        <div className="empty-state">
          <GitCompareArrows size={32} />
          <h3>No optimization result yet</h3>
          <p>
            Connect a functional FastAPI optimizer and submit a scenario to
            compare demand, daily energy costs and constraint satisfaction.
          </p>
          <div className="empty-metrics">
            <span>
              Optimized cost<strong>Unavailable</strong>
            </span>
            <span>
              Cost difference<strong>Unavailable</strong>
            </span>
            <span>
              Peak reduction<strong>Unavailable</strong>
            </span>
          </div>
          <p>No savings or feasibility claims have been calculated.</p>
        </div>
      ) : (
        <>
          {stale && (
            <p className="warning">
              Inputs have changed. Results belong to the previously submitted
              scenario.
            </p>
          )}
          <p
            className={
              result.feasibility_status === 'feasible' ? 'success' : 'warning'
            }
          >
            Constraint satisfaction:{' '}
            {result.feasibility_status === 'feasible'
              ? 'Feasible — reported by backend'
              : 'Infeasible — reported by backend'}
          </p>
          <div className="comparison-metrics">
            <span>
              Baseline daily energy cost
              <strong>{money(result.baseline_electricity_cost_usd)}</strong>
            </span>
            <span>
              Optimized daily energy cost
              <strong>
                {result.optimized_electricity_cost_usd === null
                  ? 'Unavailable'
                  : money(result.optimized_electricity_cost_usd)}
              </strong>
            </span>
            <span>
              Estimated cost difference
              <strong>
                {result.optimized_electricity_cost_usd === null
                  ? 'Unavailable'
                  : money(
                      result.baseline_electricity_cost_usd -
                        result.optimized_electricity_cost_usd,
                    )}
              </strong>
            </span>
            <span>
              Peak demand reduction
              <strong>
                {result.optimized_peak_demand_kw === null
                  ? 'Unavailable'
                  : `${(result.baseline_peak_demand_kw - result.optimized_peak_demand_kw).toFixed(2)} kW`}
              </strong>
            </span>
          </div>
          <p className="muted">
            Positive differences indicate reductions. Energy-only costs exclude
            fixed and demand charges.
          </p>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={result.baseline_demand_kw.map((baseline, h) => ({
                  hour: `${String(h).padStart(2, '0')}:00`,
                  baseline,
                  optimized: result.optimized_demand_kw?.[h],
                }))}
              >
                <CartesianGrid vertical={false} stroke="#e5ebe8" />
                <XAxis dataKey="hour" interval={3} tick={{ fontSize: 11 }} />
                <YAxis unit=" kW" width={65} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name) => [`${Number(v).toFixed(2)} kW`, name]}
                />
                <Legend />
                <Line
                  dataKey="baseline"
                  name="Baseline demand"
                  stroke="#8996a5"
                  dot={false}
                  type="stepAfter"
                  isAnimationActive={false}
                />
                <Line
                  dataKey="optimized"
                  name="Optimized demand"
                  stroke="#0d9488"
                  dot={false}
                  type="stepAfter"
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {result.constraint_violations.length > 0 && (
            <ul className="violations">
              {result.constraint_violations.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
