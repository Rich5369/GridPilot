import type { OptimizationResult, Scenario } from '../../types/api'
import type { DashboardView } from '../../services/navigation'
import { money } from '../../data/demoScenario'
import { DemandChart } from '../DemandChart'
import { InfeasibilityDetails } from './InfeasibilityDetails'

export function Overview({result, scenario, stale, busy, invalid, message, onNavigate}: {
  result: OptimizationResult | null; scenario: Scenario | null; stale: boolean; busy: boolean; invalid: boolean; message: string;
  onNavigate: (view: DashboardView) => void;
}) {
  const feasible = result?.feasibility_status === 'feasible'
  const baselineValid = result?.operating_plan?.baseline_constraint_violations.length === 0
  const cost = result?.optimized_electricity_cost_usd
  return <>
    <section className="panel overview-next" aria-label="Calculation status" aria-busy={busy}>
      <h2>{busy ? 'Calculating your energy plan…' : message && message !== 'Backend result received for the submitted scenario.' ? 'Your energy plan needs attention' : stale ? 'Your inputs have changed' : !result ? 'Choose your next step' : feasible ? 'Your daily energy plan is ready' : 'Review a capacity issue'}</h2>
      <p role="status">{busy ? 'Your submitted inputs are being calculated. You can continue exploring your building.' : message && message !== 'Backend result received for the submitted scenario.' ? message : stale ? 'These results describe your previous inputs. Recalculate before using them for your current plan.' : !result ? 'Evaluate an annual improvement now, or review your hourly inputs to calculate a daily plan.' : feasible ? 'Modeled energy charges for one building-local day. Fixed and demand charges are excluded.' : 'No schedule meets all submitted constraints. This is proven infeasibility, not a connection failure.'}</p>
      {!!result?.operating_plan?.warnings.length && <ul aria-label="Calculation warnings">{result.operating_plan.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
      <div className="plan-tabs">
        <button className="secondary" onClick={() => onNavigate(result ? 'comparison' : 'savings')}>{result ? 'Inspect results and equipment plan' : 'Evaluate an improvement'}</button>
        <button className="secondary" onClick={() => onNavigate('configuration')}>{invalid ? 'Complete your energy inputs' : stale ? 'Review changed inputs' : 'Review energy inputs'}</button>
        {result && <button className="secondary" onClick={() => onNavigate('assistant')}>Explain this result</button>}
      </div>
    </section>
    {result && scenario && <>
      {feasible && <section className="overview-metrics" aria-label="Daily plan summary">
        <article className="panel"><h2>Modeled daily energy cost</h2><strong>{cost == null ? 'Unavailable' : money(cost)}</strong><p>USD / day · energy charges only</p></article>
        <article className="panel"><h2>Daily cost difference</h2><strong>{baselineValid && cost != null ? money(result.baseline_electricity_cost_usd - cost) : 'Comparison unavailable'}</strong><p>{baselineValid ? 'Baseline minus optimized · USD / day' : 'The baseline does not meet all constraints or has not been verified.'}</p></article>
        <article className="panel"><h2>Peak demand / site limit</h2><strong>{result.optimized_peak_demand_kw?.toFixed(2) ?? 'Unavailable'} / {scenario.building_max_demand_kw} kW</strong><p>{stale ? 'Previous submitted inputs' : 'Submitted daily plan'}</p></article>
      </section>}
      {!feasible && <InfeasibilityDetails result={result} stale={stale} />}
      <section className="panel overview-demand"><h2>Hourly building demand</h2><p>{stale ? 'Previous scenario · ' : ''}One building-local day · average kW per hour</p>
        <DemandChart title="Hourly building demand" total={{key:'optimized', label: feasible ? 'Optimized demand' : 'Baseline demand', values:result.optimized_demand_kw ?? result.baseline_demand_kw}} baseline={result.optimized_demand_kw ? {key:'baseline',label:'Baseline demand',values:result.baseline_demand_kw} : undefined} limit={scenario.building_max_demand_kw} />
      </section>
    </>}
  </>
}
