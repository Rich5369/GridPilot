import { DemandProfileEditor } from './DemandProfileEditor'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { ScenarioEditor, ScenarioField } from '../../types/dashboard'
import {
  defaultEditor,
  feasibilityWarnings,
  validateEditor,
} from '../../data/demoScenario'

const groups: {
  title: string
  fields: [ScenarioField, string, string?][]
}[] = [
  {
    title: 'Building',
    fields: [
      ['opening', 'Opening hour'],
      ['closing', 'Closing hour'],
      ['limit', 'Site power limit (kW)'],
    ],
  },
  {
    title: 'Electricity tariff',
    fields: [
      ['offPeak', 'Off-peak ($/kWh)', '0.01'],
      ['peak', 'Peak ($/kWh)', '0.01'],
      ['peakStart', 'Peak start hour'],
      ['peakEnd', 'Peak end hour'],
    ],
  },
  {
    title: 'Workplace EV charging',
    fields: [
      ['chargers', 'Active chargers (0–2)'],
      ['chargerPower', 'Power per charger (kW)', '0.1'],
      ['evEnergy', 'Energy per EV (kWh)', '0.1'],
      ['arrival', 'Arrival hour'],
      ['deadline', 'Completion deadline'],
    ],
  },
  {
    title: 'Flexible equipment',
    fields: [
      ['equipmentPower', 'Maximum power (kW)', '0.1'],
      ['duration', 'Full-power duration (hours)', '0.1'],
      ['equipmentStart', 'Available from hour'],
      ['equipmentEnd', 'Available until hour'],
    ],
  },
]
export function ScenarioPanel({
  editor,
  onChange,
}: {
  editor: ScenarioEditor
  onChange: (editor: ScenarioEditor) => void
}) {
  const errors = validateEditor(editor)
  return (
    <section
      className="panel configuration"
      aria-labelledby="configuration-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">USER INPUTS</p>
          <h2 id="configuration-title">
            <SlidersHorizontal size={18} />
            Scenario configuration
          </h2>
        </div>
        <button
          className="secondary"
          onClick={() => onChange({ ...defaultEditor })}
        >
          <RotateCcw size={14} />
          Reset to Default Scenario
        </button>
      </div>
      <p className="muted">
        One building-local day. Hours use 0–24; end times are exclusive.
        For example, 9–17 means 09:00 up to 17:00. Overnight windows are not supported.
        kW measures power; kWh measures energy used over time.
      </p>
      <DemandProfileEditor editor={editor} onChange={onChange} />
      <div className="form-grid">
        {groups.map((group) => (
          <fieldset key={group.title}>
            <legend>{group.title}</legend>
            {group.fields.map(([key, label, step]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  name={key}
                  type="number"
                  min={
                    ['limit', 'chargerPower', 'equipmentPower'].includes(key)
                      ? '0.01'
                      : '0'
                  }
                  step={step ?? '1'}
                  value={editor[key]}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={errors[key] ? `${key}-error` : undefined}
                  onChange={(e) =>
                    onChange({ ...editor, [key]: e.target.value })
                  }
                />
                {errors[key] && (
                  <span className="field-error" id={`${key}-error`}>
                    {errors[key]}
                  </span>
                )}
              </div>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="input-summary">
        <strong>Draft summary</strong>
        <p>
          Open {editor.opening || '—'}:00–{editor.closing || '—'}:00 ·{' '}
          {editor.limit || '—'} kW limit · {editor.chargers || '—'} chargers ×{' '}
          {editor.evEnergy || '—'} kWh each · Equipment:{' '}
          {editor.duration || '—'} h at {editor.equipmentPower || '—'} kW
        </p>
        <p>
          Fixed demand follows the selected profile. Opening
          hours are metadata; editing them does not generate a new demand
          profile. Equipment duration is converted to required energy for the
          API’s interruptible-load model.
        </p>
      </div>
      {feasibilityWarnings(editor).map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  )
}
