import type { OptimizationResult, Scenario } from '../../types/api'
import {
  deriveEnergyInsights,
  hourInterval,
  type DemandInsights,
} from '../../data/energyInsights'
import { money } from '../../data/demoScenario'
import { type SchedulingMode } from '../../services/api'

function Periods({ data, label }: { data: DemandInsights; label: string }) {
  return (
    <div className="insight-periods">
      <h4>{label}</h4>
      <ol>
        {data.highestCost.map((period) => (
          <li key={period.hour}>
            <div>
              <strong>{hourInterval(period.hour)}</strong>
              <span>
                {period.demand.toFixed(2)} kW × ${period.price.toFixed(4)}/kWh ×
                1 h
              </span>
            </div>
            <strong>{money(period.cost)}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}
export function EnergyInsights({
  scenario,
  result,
  stale,
  mode,
}: {
  scenario: Scenario | null
  result: OptimizationResult | null
  stale: boolean
  mode: SchedulingMode
}) {
  if (!result) return null
  const insights = deriveEnergyInsights(scenario, result)
  const selected = insights?.optimized ?? insights?.baseline
  const ev = Boolean(scenario?.ev_requirements.length),
    flex = Boolean(scenario?.flexible_equipment?.length)
  const title = !scenario
    ? 'Equipment configuration unavailable'
    : !ev && !flex
      ? 'Building electricity only'
      : ev && !flex
        ? 'EV charging only'
        : mode === 'ev_only'
          ? 'EV-only · equipment held at baseline'
          : ev
            ? 'EV charging and flexible equipment'
            : 'Flexible equipment only'
  const movement = !scenario
    ? 'Submitted equipment details are unavailable.'
    : !ev && !flex
      ? 'No schedulable equipment is configured.'
      : !ev && mode === 'ev_only'
        ? 'Configured flexible equipment remains at baseline.'
        : !ev
          ? 'Eligible flexible equipment can move within its submitted window.'
          : mode === 'ev_only'
            ? 'Only EV charging is eligible to move; equipment stays at baseline.'
            : 'EV charging and eligible flexible equipment can move within their submitted windows.'
  return (
    <section
      className="panel energy-insights"
      aria-label="Deterministic energy insights"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">UNDERSTAND YOUR RESULT</p>
          <h2>Energy insights</h2>
        </div>
        <span className="tag">
          {stale ? 'PREVIOUS SUBMITTED SCENARIO' : 'SUBMITTED SCENARIO'} ·{' '}
          {title}
        </span>
      </div>
      {stale && (
        <p className="warning" role="status">
          These insights use the previous submitted inputs and result. Draft
          edits are not included.
        </p>
      )}
      <p>
        Calculated from submitted hourly demand and prices. One modeled day ·
        building-local hours · energy charges only.
      </p>
      <div className="insight-grid">
        <article className="insight-card">
          <p className="eyebrow">COST CONCENTRATION · INFORMATIONAL</p>
          <h3>Highest-cost hours</h3>
          <p>
            Ranked by hourly expenditure, not by electricity price. Rankings use
            full calculation precision.
          </p>
          {insights?.optimized ? (
            <Periods data={insights.optimized} label="Optimized expenditure" />
          ) : (
            <p>Optimized hourly costs unavailable.</p>
          )}
          {insights?.baseline ? (
            <details>
              <summary>Baseline expenditure</summary>
              <Periods data={insights.baseline} label="Baseline expenditure" />
            </details>
          ) : (
            <p>
              Baseline hourly costs unavailable: demand, prices and reported
              totals must reconcile.
            </p>
          )}
          <p className="cost-note">
            Signed costs include negative-price credits. A lower price can still
            produce a higher cost when demand is greater.
          </p>
        </article>
        <article className="insight-card">
          <p className="eyebrow">CAPACITY · INFORMATIONAL</p>
          <h3>Peak demand &amp; headroom</h3>
          {selected ? (
            <>
              <p>
                {insights?.optimized ? 'Optimized' : 'Baseline'} peak{' '}
                <strong>{selected.peak.toFixed(2)} kW</strong> ·{' '}
                {selected.utilization.toFixed(1)}% of the submitted{' '}
                {scenario!.building_max_demand_kw} kW cap.
              </p>
              <p>
                {selected.headroom < -1e-6
                  ? `${(-selected.headroom).toFixed(2)} kW above the cap.`
                  : `${Math.max(0, selected.headroom).toFixed(2)} kW headroom at peak.`}
              </p>
              <details>
                <summary>Peak hours ({selected.peakHours.length})</summary>
                <p>{selected.peakHours.map(hourInterval).join(', ')}</p>
              </details>
              {insights?.baseline && (
                <p>
                  Baseline peak: {insights.baseline.peak.toFixed(2)} kW.{' '}
                  {insights.baseline.headroom < -1e-6
                    ? 'The uncontrolled baseline exceeds the submitted cap.'
                    : 'The uncontrolled baseline is within the submitted cap.'}
                </p>
              )}
            </>
          ) : (
            <p>
              Peak intelligence unavailable: submitted demand and reported peak
              must reconcile.
            </p>
          )}
          <p className="cost-note">
            Hourly average demand; this is not a measured utility billing peak.
          </p>
        </article>
        <article className="insight-card">
          <p className="eyebrow">DECISION SUPPORT · REVIEW</p>
          <h3>Scheduling tradeoffs</h3>
          {insights?.costReduction != null && insights.peakReduction != null ? (
            <>
              <p>
                Modeled daily energy cost:{' '}
                <strong>
                  {Math.abs(insights.costReduction) < 0.005
                    ? 'unchanged at cent precision'
                    : `${money(Math.abs(insights.costReduction))} ${insights.costReduction > 0 ? 'lower' : 'higher'}`}
                </strong>{' '}
                compared with baseline.
              </p>
              <p>
                Peak demand:{' '}
                <strong>
                  {Math.abs(insights.peakReduction) < 0.005
                    ? 'unchanged at 0.01 kW precision'
                    : `${Math.abs(insights.peakReduction).toFixed(2)} kW ${insights.peakReduction > 0 ? 'lower' : 'higher'}`}
                </strong>{' '}
                compared with baseline.
              </p>
              {insights.costReduction > 2e-7 &&
                insights.peakReduction < -1e-6 && (
                  <p className="warning">
                    Lower energy cost comes with a higher hourly peak. Review
                    both when comparing alternatives.
                  </p>
                )}
            </>
          ) : (
            <p>
              Verified cost and peak changes are unavailable for this result.
            </p>
          )}
          <p>{movement} Fixed building loads stay unchanged.</p>
          <p>
            Action: compare explicit input alternatives in What-if scenarios,
            then review feasibility, cost and peak together. These results do
            not establish real utility-bill savings.
          </p>
        </article>
      </div>
      <details className="insight-evidence">
        <summary>Constraints &amp; calculation evidence</summary>
        <p>
          {result.feasibility_status === 'feasible'
            ? 'The backend reports a feasible schedule under the submitted constraints. This does not prove optimality or verify actual building operation.'
            : 'The backend reports no feasible schedule. Optimized cost and demand insights are unavailable.'}
        </p>
        {result.constraint_violations.length ? (
          <>
            <p>Backend-reported evidence:</p>
            <ul>
              {result.constraint_violations.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            No constraint violations were reported for the optimized result.
            This does not establish that the uncontrolled baseline is feasible.
          </p>
        )}
        <p>
          Hourly expenditure = aggregate demand (kW) × 1 hour × submitted price
          (USD/kWh). Aggregate demand includes all end uses once. Daily costs
          and peaks must match the reported result within $0.0000002 and
          0.000001 kW. Missing or inconsistent data is unavailable; no
          optimization is run to create these insights.
        </p>
      </details>
    </section>
  )
}
