import { formatWindow } from '../../data/time'
import {
  analysisLabel,
  includesEV,
  includesFlexible,
} from '../../data/analysisOptions'
import { ScenarioDemandTable } from './ScenarioDemandTable'
import type { ScenarioEditor } from '../../types/dashboard'
import { profileSource } from '../../data/demoScenario'
import { type SchedulingMode } from '../../services/api'

export function ScenarioSummary({
  editor,
  mode,
  label,
  onEdit,
}: {
  editor: ScenarioEditor
  mode: SchedulingMode
  label: string
  onEdit?: () => void
}) {
  return (
    <section className="panel scenario-summary" aria-label={label}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{label}</p>
          <h2>
            {editor.demandProfile?.mode && editor.demandProfile.mode !== 'demo'
              ? 'User-configured scenario'
              : 'Demonstration scenario'}
          </h2>
        </div>
        {onEdit && (
          <button className="secondary" onClick={onEdit}>
            Edit scenario →
          </button>
        )}
      </div>
      <dl className="scenario-facts">
        <div>
          <dt>Site power limit</dt>
          <dd>{editor.limit || '—'} kW</dd>
        </div>
        {includesEV(editor) && (
          <div>
            <dt>EV energy required</dt>
            <dd>
              {editor.chargers} × {editor.evEnergy || '—'} kWh
            </dd>
          </div>
        )}
        {includesFlexible(editor) && Number(editor.duration) > 0 && (
          <div>
            <dt>Equipment window</dt>
            <dd>{formatWindow(editor.equipmentStart, editor.equipmentEnd)}</dd>
          </div>
        )}
        <div>
          <dt>Analysis</dt>
          <dd>{analysisLabel(editor, mode)}</dd>
        </div>
        {editor.customEquipment && (
          <div>
            <dt>Custom equipment</dt>
            <dd>
              {editor.customEquipment.name} · {editor.customEquipment.kind}
              {editor.customEquipment.kind === 'schedulable' &&
              includesFlexible(editor)
                ? ` · ${editor.customEquipment.energy} kWh at up to ${editor.customEquipment.power} kW · ${formatWindow(editor.customEquipment.start, editor.customEquipment.end)}`
                : ' · no separate scheduled demand added'}
            </dd>
          </div>
        )}
      </dl>
      <details className="scenario-settings">
        <summary>All scenario settings</summary>
        <dl className="scenario-facts">
          <div>
            <dt>Operating hours</dt>
            <dd>{formatWindow(editor.opening, editor.closing)}</dd>
          </div>
          <div>
            <dt>Off-peak / peak tariff</dt>
            <dd>
              ${editor.offPeak} / ${editor.peak} per kWh
            </dd>
          </div>
          <div>
            <dt>Peak tariff hours</dt>
            <dd>{formatWindow(editor.peakStart, editor.peakEnd)}</dd>
          </div>
          <div>
            <dt>EV availability</dt>
            <dd>
              {includesEV(editor)
                ? formatWindow(editor.arrival, editor.deadline)
                : 'Not included'}
            </dd>
          </div>
          {includesEV(editor) && (
            <div>
              <dt>Power per charger</dt>
              <dd>{editor.chargerPower} kW</dd>
            </div>
          )}
          {includesFlexible(editor) && Number(editor.duration) > 0 && (
            <div>
              <dt>Equipment power / duration</dt>
              <dd>
                {editor.equipmentPower} kW × {editor.duration} h
              </dd>
            </div>
          )}
        </dl>
        <ScenarioDemandTable editor={editor} label={label} />
      </details>
      <p className="profile-provenance">
        {profileSource(editor)}.{' '}
        {(!editor.demandProfile || editor.demandProfile.mode === 'demo') &&
          'Fictional demonstration inputs; not meter data.'}{' '}
        Tariffs and equipment use your scenario settings.
      </p>
    </section>
  )
}
