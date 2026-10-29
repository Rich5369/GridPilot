import type { ScenarioEditor } from '../../types/dashboard'
import {
  background,
  hvac,
  fixedDemand,
  demandProfileErrors,
  profileSource,
  sourceCategories,
} from '../../data/demoScenario'

export function DemandProfileEditor({
  editor,
  onChange,
  prefix = 'current',
}: {
  editor: ScenarioEditor
  onChange: (editor: ScenarioEditor) => void
  prefix?: string
}) {
  const custom = editor.demandProfile?.mode === 'custom'
  const values =
    editor.demandProfile?.values ??
    background.map((v, h) => String(v + hvac[h]))
  const errors = demandProfileErrors(editor)
  const valid = !errors.some(Boolean)
  const demand = fixedDemand(editor)
  const id = `${prefix}-fixed-demand`
  return (
    <fieldset className="demand-profile">
      <legend>Fixed electricity demand</legend>
      <div className="field">
        <label htmlFor={`${id}-mode`}>Demand profile source</label>
        <select
          id={`${id}-mode`}
          value={editor.demandProfile?.mode ?? 'demo'}
          aria-describedby={`${id}-help`}
          onChange={(event) =>
            onChange({
              ...editor,
              demandProfile: {
                ...editor.demandProfile,
                mode: event.target.value as 'demo' | 'custom' | 'sources',
                values: [...values],
              },
            })
          }
        >
          <option value="demo">Demonstration background + HVAC</option>
          <option value="custom">Custom hourly fixed demand</option>
          <option value="sources">Named fixed-demand sources</option>
        </select>
      </div>
      <p id={`${id}-help`}>
        Fixed demand is the electricity your building uses before the EV
        charging and flexible equipment configured separately. Include lighting,
        background loads and HVAC in each hourly average (kW). Custom values
        replace the entire demo background + HVAC profile; nothing is added to
        them.
      </p>
      <p>
        If starting from whole-site readings, subtract any EV charging and
        flexible equipment modeled separately here. Opening hours do not
        automatically change this profile.
      </p>
      <p className="profile-source">{profileSource(editor)}</p>
      <p className="profile-summary" aria-live="polite">
        {valid
          ? `Fixed-load energy: ${demand.reduce((sum, kw) => sum + kw, 0).toFixed(2)} kWh over 24 hours · Peak hourly fixed demand: ${Math.max(...demand).toFixed(2)} kW`
          : 'Profile incomplete. Open the hourly editor and correct values before running optimization.'}
      </p>
      {editor.demandProfile?.mode === 'sources' && (
        <div>
          <p>
            Named profiles replace the combined profile. Enter only electricity
            demand, excluding separately modeled vehicle charging and shiftable
            equipment. These fixed loads cannot be optimized.
          </p>
          <p>
            Categories group end uses from{' '}
            <a
              href="https://www.eia.gov/consumption/commercial/reports/2018/estimated-end-use.php"
              target="_blank"
              rel="noreferrer"
            >
              EIA CBECS
            </a>
            . No survey percentages or inferred hourly allocations are applied.
          </p>
          {errors.some(Boolean) && (
            <p role="alert">
              Correct source values: each source needs 24 finite, nonnegative kW
              values.
            </p>
          )}
          {(editor.demandProfile.sources ?? []).map((source, index) => (
            <details key={source.category} className="profile-hours">
              <summary>{source.category} · fixed</summary>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  onChange({
                    ...editor,
                    demandProfile: {
                      ...editor.demandProfile!,
                      sources: editor.demandProfile!.sources!.filter(
                        (_, i) => i !== index,
                      ),
                    },
                  })
                }
              >
                Remove {source.category}
              </button>
              <div className="profile-hour-grid">
                {source.values.map((value, hour) => (
                  <div className="field" key={hour}>
                    <label htmlFor={`${id}-source-${index}-${hour}`}>
                      {String(hour).padStart(2, '0')}:00–
                      {String(hour + 1).padStart(2, '0')}:00 (kW)
                    </label>
                    <input
                      id={`${id}-source-${index}-${hour}`}
                      type="number"
                      min="0"
                      step="any"
                      value={value}
                      aria-invalid={
                        value.trim() === '' ||
                        !Number.isFinite(Number(value)) ||
                        Number(value) < 0
                      }
                      onChange={(event) =>
                        onChange({
                          ...editor,
                          demandProfile: {
                            ...editor.demandProfile!,
                            sources: editor.demandProfile!.sources!.map(
                              (s, i) =>
                                i === index
                                  ? {
                                      ...s,
                                      values: s.values.map((v, h) =>
                                        h === hour ? event.target.value : v,
                                      ),
                                    }
                                  : s,
                            ),
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </details>
          ))}
          <div className="source-actions">
            {sourceCategories
              .filter(
                (category) =>
                  !editor.demandProfile?.sources?.some(
                    (s) => s.category === category,
                  ),
              )
              .map((category) => (
                <button
                  className="secondary"
                  key={category}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...editor,
                      demandProfile: {
                        ...editor.demandProfile!,
                        sources: [
                          ...(editor.demandProfile?.sources ?? []),
                          { category, values: Array<string>(24).fill('0') },
                        ],
                      },
                    })
                  }
                >
                  Add {category}
                </button>
              ))}
          </div>
        </div>
      )}
      {custom && (
        <details className="profile-hours">
          <summary>Edit 24 hourly demand values (kW)</summary>
          <p>
            Each value is the average power during that hour. 09:00–10:00 covers
            one hour. Switching back to demonstration keeps your custom entries
            for this draft.
          </p>
          {values.length !== 24 && (
            <p role="alert">Enter exactly 24 hourly values.</p>
          )}
          <div className="profile-hour-grid">
            {values.map((value, hour) => {
              const hourId = `${id}-${hour}`
              const label = `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`
              return (
                <div className="field" key={hour}>
                  <label htmlFor={hourId}>{label} (kW)</label>
                  <input
                    id={hourId}
                    name={hourId}
                    type="number"
                    min="0"
                    step="any"
                    value={value}
                    aria-invalid={Boolean(errors[hour])}
                    aria-describedby={
                      errors[hour] ? `${hourId}-error` : undefined
                    }
                    onChange={(event) =>
                      onChange({
                        ...editor,
                        demandProfile: {
                          ...editor.demandProfile,
                          mode: 'custom',
                          values: values.map((v, h) =>
                            h === hour ? event.target.value : v,
                          ),
                        },
                      })
                    }
                  />
                  {errors[hour] && (
                    <span id={`${hourId}-error`} className="field-error">
                      {errors[hour]}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </details>
      )}
    </fieldset>
  )
}
