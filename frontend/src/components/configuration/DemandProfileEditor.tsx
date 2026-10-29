import type { ScenarioEditor } from '../../types/dashboard'
import { background, hvac, fixedDemand, demandProfileErrors, profileSource } from '../../data/demoScenario'

export function DemandProfileEditor({ editor, onChange, prefix = 'current' }: {
  editor: ScenarioEditor
  onChange: (editor: ScenarioEditor) => void
  prefix?: string
}) {
  const custom = editor.demandProfile?.mode === 'custom'
  const values = editor.demandProfile?.values ?? background.map((v, h) => String(v + hvac[h]))
  const errors = demandProfileErrors(editor)
  const valid = !errors.some(Boolean)
  const demand = fixedDemand(editor)
  const id = `${prefix}-fixed-demand`
  return <fieldset className="demand-profile">
    <legend>Fixed electricity demand</legend>
    <div className="field">
      <label htmlFor={`${id}-mode`}>Demand profile source</label>
      <select id={`${id}-mode`} value={custom ? 'custom' : 'demo'} aria-describedby={`${id}-help`} onChange={event => onChange({
        ...editor, demandProfile: { mode: event.target.value as 'demo' | 'custom', values: [...values] },
      })}>
        <option value="demo">Demonstration background + HVAC</option>
        <option value="custom">Custom hourly fixed demand</option>
      </select>
    </div>
    <p id={`${id}-help`}>Fixed demand is the electricity your building uses before the EV charging and flexible equipment configured separately. Include lighting, background loads and HVAC in each hourly average (kW). Custom values replace the entire demo background + HVAC profile; nothing is added to them.</p>
    <p>If starting from whole-site readings, subtract any EV charging and flexible equipment modeled separately here. Opening hours do not automatically change this profile.</p>
    <p className="profile-source">{profileSource(editor)}</p>
    <p className="profile-summary" aria-live="polite">{valid
      ? `Fixed-load energy: ${demand.reduce((sum, kw) => sum + kw, 0).toFixed(2)} kWh over 24 hours · Peak hourly fixed demand: ${Math.max(...demand).toFixed(2)} kW`
      : 'Profile incomplete. Open the hourly editor and correct values before running optimization.'}</p>
    {custom && <details className="profile-hours">
      <summary>Edit 24 hourly demand values (kW)</summary>
      <p>Each value is the average power during that hour. 09:00–10:00 covers one hour. Switching back to demonstration keeps your custom entries for this draft.</p>
      {values.length !== 24 && <p role="alert">Enter exactly 24 hourly values.</p>}
      <div className="profile-hour-grid">
        {values.map((value, hour) => {
          const hourId = `${id}-${hour}`
          const label = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`
          return <div className="field" key={hour}>
            <label htmlFor={hourId}>{label} (kW)</label>
            <input id={hourId} name={hourId} type="number" min="0" step="any" value={value}
              aria-invalid={Boolean(errors[hour])} aria-describedby={errors[hour] ? `${hourId}-error` : undefined}
              onChange={event => onChange({ ...editor, demandProfile: { mode: 'custom', values: values.map((v, h) => h === hour ? event.target.value : v) } })} />
            {errors[hour] && <span id={`${hourId}-error`} className="field-error">{errors[hour]}</span>}
          </div>
        })}
      </div>
    </details>}
  </fieldset>
}
