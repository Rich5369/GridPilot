import { HourSelect } from './HourSelect'
import { CustomEquipmentFields } from './CustomEquipmentFields'
import { includesEV, includesFlexible } from '../../data/analysisOptions'
import { formatWindow, isTimeField, isEndField } from '../../data/time'
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
    title: 'Vehicle charging (optional · use 0 chargers to disable)',
    fields: [
      ['chargers', 'Active chargers (0–2)'],
      ['chargerPower', 'Power per charger (kW)', '0.1'],
      ['evEnergy', 'Energy per EV (kWh)', '0.1'],
      ['arrival', 'Arrival hour'],
      ['deadline', 'Completion deadline'],
    ],
  },
  {
    title: 'Shiftable equipment (0 duration disables)',
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
          type="button"
          className="secondary"
          onClick={() => onChange({ ...defaultEditor })}
        >
          <RotateCcw size={14} />
          Reset to Default Scenario
        </button>
      </div>
      <p className="muted">
        One building-local day. For example, 9:00 AM–5:00 PM excludes the end
        time. Overnight windows are not supported. kW measures power; kWh
        measures energy used over time.
      </p>
      <CustomEquipmentFields
        editor={editor}
        onChange={onChange}
        error={errors.customEquipment}
      />
      <p className="field-hint">
        All times are building-local whole hours. End times are excluded;
        overnight windows are not supported.
      </p>
      <DemandProfileEditor editor={editor} onChange={onChange} />
      <div className="form-grid">
        {groups
          .filter(
            (_, i) =>
              i < 2 ||
              (i === 2 && includesEV(editor)) ||
              (i === 3 && includesFlexible(editor)),
          )
          .map((group) => (
            <fieldset key={group.title}>
              <legend>{group.title}</legend>
              {group.fields.map(([key, label, step]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  {isTimeField(key) ? (
                    <HourSelect
                      id={key}
                      value={editor[key]}
                      end={isEndField(key)}
                      invalid={!!errors[key]}
                      describedBy={errors[key] ? `${key}-error` : undefined}
                      onChange={(value) =>
                        onChange({ ...editor, [key]: value })
                      }
                    />
                  ) : (
                    <input
                      id={key}
                      name={key}
                      type="number"
                      min={
                        ['limit', 'chargerPower', 'equipmentPower'].includes(
                          key,
                        )
                          ? '0.01'
                          : '0'
                      }
                      step={step ?? '1'}
                      value={editor[key]}
                      aria-invalid={Boolean(errors[key])}
                      aria-describedby={
                        errors[key] ? `${key}-error` : undefined
                      }
                      onChange={(e) =>
                        onChange({ ...editor, [key]: e.target.value })
                      }
                    />
                  )}
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
          Open {formatWindow(editor.opening, editor.closing)} ·{' '}
          {editor.limit || '—'} kW limit.
          {includesEV(editor)
            ? ` EVs: ${editor.chargers} × ${editor.evEnergy} kWh.`
            : ' No EV charging.'}
          {includesFlexible(editor)
            ? ` Standard equipment: ${editor.duration} h at ${editor.equipmentPower} kW.`
            : ' No flexible equipment submitted.'}
          {editor.customEquipment &&
            ` Custom: ${editor.customEquipment.name || 'Unnamed'} · ${editor.customEquipment.kind}.`}
        </p>
        <p>
          Fixed demand follows the selected profile. Opening hours are metadata;
          editing them does not generate a new demand profile. Equipment
          duration is converted to required energy for the API’s
          interruptible-load model.
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
