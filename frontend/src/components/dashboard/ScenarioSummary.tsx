import type { ScenarioEditor } from '../../types/dashboard'
import { profileSource } from '../../data/demoScenario'
import { modeLabel, type SchedulingMode } from '../../services/api'

export function ScenarioSummary({ editor, mode, label, onEdit }: {
  editor: ScenarioEditor
  mode: SchedulingMode
  label: string
  onEdit?: () => void
}) {
  return <section className="panel scenario-summary" aria-label={label}>
    <div className="section-heading">
      <div><p className="eyebrow">{label}</p><h2>{editor.demandProfile?.mode && editor.demandProfile.mode !== 'demo' ? 'User-configured scenario' : 'Demonstration scenario'}</h2></div>
      {onEdit && <button className="secondary" onClick={onEdit}>Edit scenario →</button>}
    </div>
    <dl className="scenario-facts">
      <div><dt>Site power limit</dt><dd>{editor.limit || '—'} kW</dd></div>
      <div><dt>EV energy required</dt><dd>{editor.chargers} × {editor.evEnergy || '—'} kWh</dd></div>
      <div><dt>Equipment window</dt><dd>{editor.equipmentStart}:00–{editor.equipmentEnd}:00</dd></div>
      <div><dt>Scheduling</dt><dd>{modeLabel(mode)}</dd></div>
    </dl>
    <details className="scenario-settings">
      <summary>All scenario settings</summary>
      <dl className="scenario-facts">
        <div><dt>Operating hours</dt><dd>{editor.opening}:00–{editor.closing}:00</dd></div>
        <div><dt>Off-peak / peak tariff</dt><dd>${editor.offPeak} / ${editor.peak} per kWh</dd></div>
        <div><dt>Peak tariff hours</dt><dd>{editor.peakStart}:00–{editor.peakEnd}:00</dd></div>
        <div><dt>EV availability</dt><dd>{editor.arrival}:00–{editor.deadline}:00</dd></div>
        <div><dt>Power per charger</dt><dd>{editor.chargerPower} kW</dd></div>
        <div><dt>Equipment power / duration</dt><dd>{editor.equipmentPower} kW × {editor.duration} h</dd></div>
      </dl>
    </details>
    <p className="profile-provenance">{profileSource(editor)}. {(!editor.demandProfile || editor.demandProfile.mode === 'demo') && 'Fictional demonstration inputs; not meter data.'} Tariffs and equipment use your scenario settings.</p>
  </section>
}
