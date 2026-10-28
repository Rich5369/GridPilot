import { useRef, useState } from 'react'
import type { ScenarioEditor } from '../../types/dashboard'
import type { OptimizationResult } from '../../types/api'
import { money, toScenario, validateEditor, feasibilityWarnings } from '../../data/demoScenario'
import { optimizeScenario, optimizationError, OPTIMIZATION_TIMEOUT_MS } from '../../services/api'
import { Comparison } from './Comparison'

const fields: [keyof ScenarioEditor, string, string][] = [
  ['limit', 'Maximum building demand (kW)', '0.1'],
  ['chargers', 'Active chargers (0–2)', '1'],
  ['chargerPower', 'Power per charger (kW)', '0.1'],
  ['evEnergy', 'Energy per EV (kWh)', '0.1'],
  ['arrival', 'EV arrival hour', '1'],
  ['deadline', 'EV completion deadline', '1'],
  ['peak', 'Peak electricity price (USD/kWh)', '0.01'],
]
// Normalize after rounding so a displayed -0.01 retains its sign.
function formatDifference(value: number): string {
  const displayed = value.toFixed(2)
  return displayed === '-0.00' ? '0.00' : displayed
}

type Pair = { key: string; results: [OptimizationResult | null, OptimizationResult | null]; errors: string[] }
export function WhatIf({ editor, onChange, alternative, setAlternative, busy, acquire, release }: {
  editor: ScenarioEditor; onChange: (e: ScenarioEditor) => void
  alternative: ScenarioEditor | null; setAlternative: (e: ScenarioEditor) => void
  busy: boolean; acquire: () => boolean; release: () => void
}) {
  const [original, setOriginal] = useState<ScenarioEditor | null>(() => alternative ? { ...editor } : null)
  const [names, setNames] = useState(['Current operation', 'Proposed operation'])
  const [pair, setPair] = useState<Pair | null>(null)
  const [progress, setProgress] = useState('')
  const pending = useRef(false)
  const key = JSON.stringify([editor, alternative])
  const errors = alternative ? validateEditor(alternative) : {}
  const invalid = !alternative || Object.keys(errors).length > 0 || Object.keys(validateEditor(editor)).length > 0
  const fresh = pair?.key === key ? pair : null
  function create() {
    setOriginal({ ...editor }); setAlternative({ ...editor }); setPair(null)
  }
  async function run() {
    if (invalid || pending.current || !alternative || !acquire()) return
    pending.current = true
    const snapshots = [toScenario(editor), toScenario(alternative)]
    const next: Pair = { key, results: [null, null], errors: ['', ''] }
    setPair(null)
    try {
      for (const index of [0, 1] as const) {
        setProgress(`Optimizing scenario ${index + 1} of 2…`)
        try { next.results[index] = await optimizeScenario(snapshots[index]) }
        catch (error) {
          next.errors[index] = optimizationError(error)
          // A timed-out solve may still occupy the server. Do not queue another.
          if ((error instanceof Error || error instanceof DOMException) && ['TimeoutError', 'AbortError'].includes(error.name)) {
            if (index === 0) next.errors[1] = 'Not run because the first request timed out. Wait before retrying.'
            break
          }
        }
      }
      setPair(next)
    } finally { pending.current = false; release(); setProgress('') }
  }
  return <section className="panel what-if" aria-label="Business what-if comparison">
    <h2>Business what-if comparison</h2>
    <p>Compare the current configuration with one alternative. Each scenario has its own uncontrolled baseline. No AI credentials are needed.</p>
    <div className="ai-actions">
      <button onClick={create} disabled={busy}>{alternative ? 'Reset alternative from current' : 'Create alternative from current'}</button>
      <button disabled={busy || invalid} onClick={run}>Compare both scenarios</button>
      {original && <button disabled={busy} onClick={() => onChange({ ...original })}>Restore starting scenario</button>}
      {alternative && <button disabled={busy || invalid} onClick={() => onChange({ ...alternative })}>Apply alternative to current</button>}
    </div>
    <p className="muted">Requests run one at a time, up to {OPTIMIZATION_TIMEOUT_MS / 1000} seconds each. Render may need time to wake up. No automatic retries.</p>
    {progress && <p role="status">{progress}</p>}
    {alternative && <>
      <div className="what-if-grid">
        {names.map((name, i) => <div className="field" key={i}><label htmlFor={`scenario-name-${i}`}>{i === 0 ? 'Current scenario name' : 'Alternative scenario name'}</label><input id={`scenario-name-${i}`} value={name} maxLength={80} onChange={e => setNames(names.map((n, j) => j === i ? e.target.value : n))} /></div>)}
      </div>
      <h3>Alternative operating parameters</h3>
      <p className="muted">Other inputs are copied from the configuration when the alternative is created. Edit current inputs in Scenario configuration.</p>
      <div className="form-grid">{fields.map(([field, label, step]) => <div className="field" key={field}>
        <label htmlFor={`alternative-${field}`}>{label}</label>
        <input id={`alternative-${field}`} type="number" step={step} value={alternative[field]} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `alternative-${field}-error` : undefined} onChange={e => setAlternative({ ...alternative, [field]: e.target.value })} />
        {errors[field] && <span className="field-error" id={`alternative-${field}-error`}>{errors[field]}</span>}
      </div>)}</div>
      {feasibilityWarnings(alternative).map(w => <p className="warning" key={w}>{w}</p>)}
      {invalid && <p role="status">Correct configuration errors in both scenarios before comparing.</p>}
      {pair && !fresh && <p role="status">Inputs changed. Outdated comparison results are hidden; compare again.</p>}
      {fresh && <>
        <div className="what-if-grid">{fresh.results.map((result, i) => <article key={i}>
          <h3>{names[i] || `Scenario ${i + 1}`}</h3>
          {fresh.errors[i] && <p role="alert">{fresh.errors[i]}</p>}
          {result && <>
            <dl className="what-if-totals">
              <dt>Optimized peak electrical demand</dt><dd>{result.optimized_peak_demand_kw === null ? 'Unavailable' : `${result.optimized_peak_demand_kw.toFixed(2)} kW`}</dd>
              <dt>Optimized total electricity consumption</dt><dd>{result.optimized_demand_kw === null ? 'Unavailable' : `${result.optimized_demand_kw.reduce((a, b) => a + b, 0).toFixed(2)} kWh`}</dd>
              <dt>Constraint violations reported by solver</dt><dd>{result.constraint_violations.length ? result.constraint_violations.join('; ') : 'None'}</dd>
            </dl>
            <Comparison result={result} stale={false} />
          </>}
        </article>)}</div>
        <h3>Between scenarios: alternative minus current</h3>
        <p>Each result uses its own submitted operating requirements and hourly prices. These differences are not energy savings. Positive values mean the alternative is higher. Daily energy charges exclude demand charges, taxes and fixed fees.</p>
        {fresh.results.every(r => r?.feasibility_status === 'feasible') ? <dl>
          <dt>Optimized energy charge difference (USD)</dt><dd>{money(fresh.results[1]!.optimized_electricity_cost_usd! - fresh.results[0]!.optimized_electricity_cost_usd!)}</dd>
          <dt>Optimized peak demand difference</dt><dd>{formatDifference(fresh.results[1]!.optimized_peak_demand_kw! - fresh.results[0]!.optimized_peak_demand_kw!)} kW</dd>
          <dt>Optimized consumption difference</dt><dd>{formatDifference(fresh.results[1]!.optimized_demand_kw!.reduce((a,b) => a+b,0) - fresh.results[0]!.optimized_demand_kw!.reduce((a,b) => a+b,0))} kWh</dd>
        </dl> : <p>Between-scenario differences are unavailable unless both scenarios have feasible solver results.</p>}
      </>}
    </>}
  </section>
}
