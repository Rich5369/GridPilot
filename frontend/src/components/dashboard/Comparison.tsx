import { DemandChart } from '../DemandChart'
import { GitCompareArrows } from 'lucide-react'
import type { OptimizationResult } from '../../types/api'
import { money } from '../../data/demoScenario'
export function Comparison({
  result,
  stale,
  limit,
}: {
  result: OptimizationResult | null
  limit?: number
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
            Choose Scenario configuration to review your inputs, then select Run optimization.
            Your baseline and optimized demand will appear here.
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
            <p className="warning" role="status">
              Inputs have changed. Results belong to the previously submitted
              scenario. Run optimization again before using these results for the current inputs.
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
            {result.feasibility_status === 'feasible'
              ? 'The returned schedule meets the modeled energy requirements, availability windows and site power limit. This is a planning estimate, not a utility bill forecast. '
              : 'No schedule meets all modeled constraints. Review the reasons below, then adjust the power limit, energy requirements or availability windows. '}
            Costs are in USD. Positive differences indicate reductions. Energy-only costs exclude
            fixed and demand charges.
          </p>
          <DemandChart title="Baseline versus optimized demand" limit={limit}
            total={{ key: result.optimized_demand_kw ? 'optimized' : 'baseline', label: result.optimized_demand_kw ? 'Optimized demand' : 'Baseline demand', values: result.optimized_demand_kw ?? result.baseline_demand_kw }}
            baseline={result.optimized_demand_kw ? { key: 'baseline', label: 'Baseline demand', values: result.baseline_demand_kw } : undefined} />
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
