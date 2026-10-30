import { demandProfileErrors, fixedDemand } from '../../data/demoScenario'
import type { ScenarioEditor } from '../../types/dashboard'

/** Read-only inspection of the editor supplied by the parent, including submitted snapshots. */
export function ScenarioDemandTable({ editor, label }: { editor: ScenarioEditor; label: string }) {
  const profile = editor.demandProfile
  if (!profile || profile.mode === 'demo') return null
  if (demandProfileErrors(editor).some(Boolean)) {
    return <p className="profile-provenance">Hourly input inspection is unavailable until the draft profile is complete.</p>
  }
  const named = profile.mode === 'sources'
  const columns = named
    ? (profile.sources ?? []).map(source => ({ name: source.category, values: source.values }))
    : [{ name: 'Combined fixed demand', values: profile.values }]
  const totals = named ? fixedDemand(editor) : null
  return <div className="table-scroll scenario-demand-table" role="region" aria-label={`${label} hourly fixed-demand inputs`} tabIndex={0}>
    <table>
      <caption>{label} · {named ? 'Named' : 'Custom'} fixed-demand inputs · kW · 24 one-hour intervals</caption>
      <thead><tr>
        <th scope="col">Building-local hour</th>
        {columns.map(column => <th scope="col" key={column.name}>{column.name} (kW)</th>)}
        {totals && <th scope="col">Combined fixed demand (kW)</th>}
      </tr></thead>
      <tbody>{Array.from({ length: 24 }, (_, hour) => <tr key={hour}>
        <th scope="row">{String(hour).padStart(2, '0')}:00–{String(hour + 1).padStart(2, '0')}:00</th>
        {columns.map(column => <td key={column.name}>{column.values[hour]}</td>)}
        {totals && <td>{totals[hour]}</td>}
      </tr>)}</tbody>
    </table>
    <p className="profile-provenance">{label} inputs only. Excludes separately modeled EV charging and flexible equipment. Manually entered, not verified meter data.</p>
  </div>
}
