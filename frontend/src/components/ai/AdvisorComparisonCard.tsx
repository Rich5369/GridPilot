import type { AdvisorComparison } from '../../services/advisorComparison'
import './advisor-comparison.css'

const money = (value: number | null) => value === null ? 'Unavailable' : `$${Math.abs(value) < 0.005 ? '0.00' : value.toFixed(2)}`
const power = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(2)} kW`

export function AdvisorComparisonCard({ comparison, stale }: {
  comparison: AdvisorComparison; stale: boolean
}) {
  const { current, alternative } = comparison
  return <section className="advisor-comparison" aria-label="Verified scenario comparison">
    <h3>Current plan vs. proposed alternative</h3>
    {stale && <p role="status">This comparison belongs to an earlier setup. Request a new proposal for your current draft.</p>}
    <ol aria-label="Comparison activity">{comparison.activity.map(step => <li key={step}>{step}</li>)}</ol>
    <p>{comparison.message}</p>
    <p className="advisor-caption">{comparison.explanation_source === 'meta' ? 'Meta explanation · optimizer-calculated values' : 'Meta explanation unavailable · optimizer-calculated values'}</p>
    <div className="advisor-comparison-table"><table>
      <caption>Optimized outcomes for each scenario · daily energy charges only</caption>
      <thead><tr><th scope="col">Measure</th><th scope="col">Current plan</th><th scope="col">Alternative</th></tr></thead>
      <tbody>
        <tr><th scope="row">Can requirements be met?</th><td>{current.feasibility_status === 'feasible' ? 'Yes' : 'No'}</td><td>{alternative.feasibility_status === 'feasible' ? 'Yes' : 'No'}</td></tr>
        <tr><th scope="row">Energy cost / day</th><td>{money(current.optimized_electricity_cost_usd)}</td><td>{money(alternative.optimized_electricity_cost_usd)}</td></tr>
        <tr><th scope="row">Peak demand</th><td>{power(current.optimized_peak_demand_kw)}</td><td>{power(alternative.optimized_peak_demand_kw)}</td></tr>
      </tbody>
    </table></div>
    {comparison.daily_cost_difference_usd !== null && <p>{Math.abs(comparison.daily_cost_difference_usd) < 0.005
      ? 'Modeled daily energy costs are effectively unchanged.'
      : `The alternative costs ${money(Math.abs(comparison.daily_cost_difference_usd))} ${comparison.daily_cost_difference_usd > 0 ? 'less' : 'more'} per day under these assumptions.`}</p>}
    <ul aria-label="Comparison limitations">{comparison.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    {comparison.follow_up_question && <section aria-label="Comparison follow-up question"><h4>One question</h4><p>{comparison.follow_up_question}</p></section>}
    <details><summary>Hourly schedules and constraint evidence</summary>
      {([{ label: 'Current plan', result: current }, { label: 'Alternative', result: alternative }]).map(({ label, result }) => {
        return <section key={label}><h4>{label}</h4>
          {result.constraint_violations.map(reason => <p key={reason}>{reason}</p>)}
          {result.operating_plan?.device_schedules.map(device => <p key={`${device.device_type}:${device.device_id}`}>{device.device_id}: {device.optimized_power_kw
            ? device.optimized_power_kw.map((kw, hour) => kw > 1e-6 ? `${hour}:00 ${kw.toFixed(2)} kW` : null).filter(Boolean).join('; ') || 'No energy required'
            : 'No feasible schedule'}</p>)}
          {!result.operating_plan?.device_schedules.length && <p>No individual device schedules for this setup.</p>}
        </section>
      })}
    </details>
  </section>
}
