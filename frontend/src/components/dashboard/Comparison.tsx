import { InfeasibilityDetails } from './InfeasibilityDetails'
import { DemandChart } from '../DemandChart'
import { GitCompareArrows } from 'lucide-react'
import type { OptimizationResult } from '../../types/api'
import { money } from '../../data/demoScenario'
export function Comparison({
  result,
  stale,
  limit,
  fixedDemand,
}: {
  result: OptimizationResult | null
  fixedDemand?: number[]
  limit?: number
  stale: boolean
}) {
  const costDifference =
    result?.optimized_electricity_cost_usd != null
      ? result.baseline_electricity_cost_usd -
        result.optimized_electricity_cost_usd
      : null
  const energy = result?.optimized_demand_kw?.reduce((sum, kw) => sum + kw, 0)
  const baselineEnergy = result?.baseline_demand_kw.reduce(
    (sum, kw) => sum + kw,
    0,
  )
  return (
    <section className="panel comparison">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BASELINE VS. OPTIMIZED</p>
          <h2>Optimization comparison</h2>
        </div>
        <span className="tag">
          {result
            ? stale
              ? 'PREVIOUS SCENARIO · STALE'
              : 'SOLVER RESULT'
            : 'AWAITING SOLVER'}
        </span>
      </div>
      {!result ? (
        <div className="empty-state">
          <GitCompareArrows size={32} />
          <h3>No optimization result yet</h3>
          <p>
            Choose Scenario configuration to review your inputs, then select Run
            optimization. Your baseline and optimized demand will appear here.
          </p>
          <p>No savings or feasibility claims have been calculated.</p>
        </div>
      ) : (
        <>
          {stale && (
            <p className="warning" role="status">
              Inputs have changed. Results belong to the previously submitted
              scenario. Run optimization again before using these results for
              the current inputs.
            </p>
          )}
          <div
            className={`outcome ${result.feasibility_status === 'feasible' ? 'outcome-feasible' : 'outcome-infeasible'}`}
          >
            <div>
              <p className="eyebrow">
                {stale
                  ? 'PREVIOUS SUBMITTED RESULT'
                  : 'YOUR OPTIMIZATION OUTCOME'}
              </p>
              <h3>
                {result.feasibility_status !== 'feasible'
                  ? 'No feasible schedule was found.'
                  : costDifference === null
                    ? 'Schedule calculated.'
                    : Math.abs(costDifference) < 0.005
                      ? 'A feasible schedule at the same energy cost.'
                      : costDifference > 0
                        ? `${money(costDifference)} lower energy charges for this day.`
                        : `${money(-costDifference)} higher energy charges to meet the constraints.`}
              </h3>
              <p>
                {result.feasibility_status === 'feasible'
                  ? 'Scheduling shifts when electricity is used. Lower costs do not imply lower energy consumption.'
                  : 'No schedule meets all modeled constraints. Review the backend-reported evidence below; this result does not establish a recovery strategy.'}
              </p>
            </div>
            <span
              className={
                result.feasibility_status === 'feasible' ? 'success' : 'warning'
              }
            >
              {result.feasibility_status === 'feasible'
                ? 'Feasible — reported by backend'
                : 'Infeasible — reported by backend'}
            </span>
          </div>
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
          <div className="energy-context">
            <span>
              Daily energy{' '}
              <strong>
                {energy == null ? 'Unavailable' : `${energy.toFixed(1)} kWh`}
              </strong>
              <small>Baseline {baselineEnergy?.toFixed(1)} kWh</small>
            </span>
            <span>
              Optimized peak{' '}
              <strong>
                {result.optimized_peak_demand_kw === null
                  ? 'Unavailable'
                  : `${result.optimized_peak_demand_kw.toFixed(2)} kW`}
              </strong>
              <small>
                Baseline {result.baseline_peak_demand_kw.toFixed(2)} kW ·
                Submitted limit {limit ?? '—'} kW
              </small>
            </span>
          </div>
          <p className="cost-note">
            One day · USD · Energy charges only, excluding fixed and demand
            charges. Positive differences indicate reductions.
          </p>
          <InfeasibilityDetails result={result} stale={stale} />
          <DemandChart
            title="Baseline versus optimized demand"
            limit={limit}
            fixed={
              fixedDemand
                ? {
                    key: 'fixed',
                    label: 'Fixed building demand (unchanged)',
                    values: fixedDemand,
                  }
                : undefined
            }
            total={{
              key: result.optimized_demand_kw ? 'optimized' : 'baseline',
              label: result.optimized_demand_kw
                ? 'Optimized demand'
                : 'Baseline demand',
              values: result.optimized_demand_kw ?? result.baseline_demand_kw,
            }}
            baseline={
              result.optimized_demand_kw
                ? {
                    key: 'baseline',
                    label: 'Baseline demand',
                    values: result.baseline_demand_kw,
                  }
                : undefined
            }
          />
        </>
      )}
    </section>
  )
}
