import { lazy, Suspense, useRef, useState } from 'react'
import {
  Building2,
  GitCompareArrows,
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'
import { BackendStatus } from '../components/BackendStatus'
import { ScenarioSummary } from '../components/dashboard/ScenarioSummary'
import { ScenarioPanel } from '../components/configuration/ScenarioPanel'
import {
  CostBreakdown,
  defaultBillingInputs,
} from '../components/dashboard/CostBreakdown'
import { EnergyAssistant } from '../components/ai/EnergyAssistant'
import {
  defaultEditor,
  profileSource,
  fixedDemand,
  toScenario,
  validateEditor,
} from '../data/demoScenario'
import {
  OPTIMIZATION_TIMEOUT_MS,
  optimizationError,
  optimizeScenario,
  modeLabel,
  type SchedulingMode,
} from '../services/api'
import type { ScenarioEditor } from '../types/dashboard'
import type { Scenario, OptimizationResult } from '../types/api'
const DemandChart = lazy(() =>
  import('../components/DemandChart').then(module => ({ default: module.DemandChart })),
)
const Comparison = lazy(() =>
  import('../components/dashboard/Comparison').then((module) => ({
    default: module.Comparison,
  })),
)
const WhatIf = lazy(() => import('../components/dashboard/WhatIf').then(m => ({ default: m.WhatIf })))
const views = [
  { id: 'overview', label: 'Energy overview', icon: LayoutDashboard },
  {
    id: 'configuration',
    label: 'Scenario configuration',
    icon: SlidersHorizontal,
  },
  { id: 'comparison', label: 'Optimization', icon: GitCompareArrows },
  { id: 'whatif', label: 'What-if scenarios', icon: GitCompareArrows },
  { id: 'assistant', label: 'AI assistant', icon: Sparkles },
] as const
export function Dashboard() {
  const [mode, setMode] = useState<SchedulingMode>('ev_only')
  const modeVersion = useRef(0)
  const [modeRevision, setModeRevision] = useState(0)
  const [resultMode, setResultMode] = useState<SchedulingMode>('ev_only')
  const [billingInputs, setBillingInputs] = useState(defaultBillingInputs)
  const [appliedBilling, setAppliedBilling] = useState(defaultBillingInputs)
  const [view, setView] = useState<string>('overview')
  const [editor, setEditor] = useState({ ...defaultEditor })
  const [alternative, setAlternative] = useState<ScenarioEditor | null>(null)
  // An AI handoff starts a new comparison and captures the current Restore snapshot.
  const [whatIfSession, setWhatIfSession] = useState(0)
  const [whatIfVisited, setWhatIfVisited] = useState(false)
  const [result, setResult] = useState<OptimizationResult | null>(null)
  const [submitted, setSubmitted] = useState('')
  const [resultScenario, setResultScenario] = useState<Scenario | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [message, setMessage] = useState('')
  const invalid = Object.keys(validateEditor(editor)).length > 0
  const stale = Boolean(result) && submitted !== JSON.stringify(editor)
  const submittedEditor: ScenarioEditor | null = result && submitted ? JSON.parse(submitted) : null
  async function runOptimization() {
    if (invalid || inFlight.current) return
    inFlight.current = true
    const snapshot = JSON.stringify(editor)
    const version = modeVersion.current
    const submittedMode = mode
    setBusy(true)
    setMessage('')
    try {
      const response = await optimizeScenario(toScenario(editor), submittedMode)
      if (version !== modeVersion.current) return
      setResultMode(submittedMode)
      setResult(response)
      setResultScenario(toScenario(JSON.parse(snapshot)))
      setSubmitted(snapshot)
      setView('comparison')
      setMessage('Backend result received for the submitted scenario.')
    } catch (error) {
      if (version === modeVersion.current) setMessage(optimizationError(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#overview">Skip to main content</a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#overview"
          onClick={() => setView('overview')}
        >
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          GridPilot<span className="brand-period">.</span>
        </a>
        <div className="workspace">
          <Building2 size={20} />
          <div>
            <strong>Scenario workspace</strong>
            <span>Single-day energy planning</span>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {views.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? 'nav-active' : 'nav-item'}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => { setView(id); if (id === 'whatif') setWhatIfVisited(true) }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tag">SCENARIO WORKSPACE</span>
          <p>
            Understand demand.
            <br />
            Plan with confidence.
          </p>
          <span>
            24 hourly intervals
            <br />
            Commercial energy analytics
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">GP</span>
          <div>
            <strong>GridPilot team</strong>
            <span>Live optimization workspace</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>
            <strong>{views.find((v) => v.id === view)?.label}</strong>
          </span>
          <BackendStatus />
        </header>
        <main id="overview" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR ENERGY, IN FOCUS</p>
              <h1>{views.find((v) => v.id === view)?.label}</h1>
              <p className="muted">
                24 hourly intervals · Building-local time · USD
              </p>
            </div>
            <button
              className="run-button"
              onClick={runOptimization}
              disabled={busy || invalid}
              aria-busy={busy}
              aria-describedby="optimization-help"
            >
              <Zap size={17} />
              {busy ? 'Requesting optimization…' : 'Run optimization'}
            </button>
          </div>
          <section className="workflow" aria-label="Energy planning workflow">
            <div className={`workflow-status ${stale ? 'is-stale' : ''}`} role="status">{busy ? 'Calculating your submitted scenario…' : !result ? 'Ready to configure · No backend result yet' : stale ? 'Inputs changed · Run optimization to update your results' : `Result available · ${modeLabel(resultMode)} · ${result.feasibility_status}`}</div>
            <div className="workflow-actions">
              <button className="secondary" onClick={() => setView('configuration')}>1. Configure scenario</button>
              <button className="secondary" onClick={() => setView('comparison')}>2. Review results</button>
              <button className="secondary" onClick={() => { setWhatIfVisited(true); setView('whatif') }}>3. Compare alternatives</button>
            </div>
          </section>
          <div className="mode-control field">
            <label htmlFor="scheduling-mode">Scheduling mode</label>
            <select id="scheduling-mode" aria-describedby="scheduling-assumptions-label" value={mode} onChange={event => {
              modeVersion.current += 1
              setModeRevision(modeVersion.current)
              setMode(event.target.value as SchedulingMode)
              setResult(null); setResultScenario(null); setMessage('Scheduling mode changed. Run again for new results.')
            }}>
              <option value="ev_only">EV-only</option>
              <option value="joint">EV + flexible equipment</option>
            </select>
            <details className="mode-explanation">
              <summary id="scheduling-assumptions-label">Scheduling assumptions · {modeLabel(mode)}</summary>
              <p>{mode === 'ev_only'
                ? 'Moves EV charging within arrival and completion times. Equipment and fixed building demand stay unchanged.'
                : 'Moves EV charging and eligible equipment within their allowed windows. Flexible equipment is modeled as interruptible and continuously adjustable: it can pause and vary power. Uninterrupted machine cycles are not modeled. Fixed building demand stays unchanged.'}</p>
            </details>
          </div>
          <p id="optimization-help" className="action-help">
            {busy
              ? `Optimization is running. This request can take up to ${OPTIMIZATION_TIMEOUT_MS / 1000} seconds. Please wait.`
              : invalid
                ? 'Correct the scenario validation errors before submitting.'
                : 'Runs the current scenario on the backend. Results estimate one day of energy charges, excluding fixed and demand charges.'}
          </p>
          {message && (
            <div className={message === 'Backend result received for the submitted scenario.' ? 'sr-only' : 'request-message'} role="status">
              {message}
            </div>
          )}
          {(view === 'overview' || view === 'comparison') && <>
            <Suspense fallback={<p role="status">Loading comparison…</p>}>
              <Comparison result={result} limit={resultScenario?.building_max_demand_kw} stale={stale} />
            </Suspense>
            <ScenarioSummary editor={editor} mode={mode} label="Editable draft" onEdit={() => setView('configuration')} />
            {submittedEditor && <details className="panel result-details">
              <summary>Submitted scenario &amp; result provenance</summary>
              <p>Displayed result mode: {modeLabel(resultMode)}</p>
              <p className="profile-provenance">Optimizer-calculated result · Submitted inputs: {profileSource(submittedEditor)}</p>
              <ScenarioSummary editor={submittedEditor} mode={resultMode} label="Submitted snapshot" />
              <p>Energy charges exclude fixed and demand charges. Solver results describe modeled constraints, not verified building operation.</p>
            </details>}
            {!result && !invalid && <section className="panel draft-preview">
              <p className="eyebrow">DRAFT INPUTS · NOT AN OPTIMIZATION RESULT</p>
              <h2>Your building demand</h2>
              <p>Fixed demand only. EV charging and flexible equipment are included after optimization.</p>
              <Suspense fallback={<p role="status">Loading fixed demand chart…</p>}>
                <DemandChart total={{ key: 'fixed-total', label: 'Fixed building demand', values: fixedDemand(editor) }} limit={Number(editor.limit)} />
              </Suspense>
            </section>}
            {result && <details className="panel result-details">
              <summary>Explore baseline billing assumptions</summary>
              <p>Baseline from the submitted result{stale ? ' (previous scenario)' : ''}. Additional charges below are manually entered estimates.</p>
              <CostBreakdown energy={result.baseline_electricity_cost_usd} inputs={billingInputs} setInputs={setBillingInputs} applied={appliedBilling} setApplied={setAppliedBilling} />
            </details>}
          </>}
          {view === 'configuration' && (
            <>
              <ScenarioPanel editor={editor} onChange={setEditor} />
              {!invalid && (
                <Suspense fallback={<p role="status">Loading fixed demand chart…</p>}>
                  <section className="panel">
                    <h2>Fixed building demand preview</h2>
                    <p>Draft inputs only · excludes vehicle charging and shiftable equipment schedules. Run optimization to see whole-building demand.</p>
                    <DemandChart
                      total={{ key: 'fixed-total', label: 'Fixed building demand', values: fixedDemand(editor) }}
                      limit={Number(editor.limit)}
                      sources={editor.demandProfile?.mode === 'sources'
                        ? editor.demandProfile.sources?.map((source, i) => ({
                            key: `source-${i}`, label: `${source.category} · fixed`, values: source.values.map(Number),
                          }))
                        : [{ key: 'combined', label: 'Combined / unallocated fixed demand', values: fixedDemand(editor) }]}
                    />
                  </section>
                </Suspense>
              )}
            </>
          )}
          {whatIfVisited && <div hidden={view !== 'whatif'}><Suspense fallback={<p role="status">Loading what-if comparison…</p>}><WhatIf key={whatIfSession} modeRevision={modeRevision} mode={mode} editor={editor} onChange={setEditor} alternative={alternative} setAlternative={setAlternative} busy={busy} acquire={() => { if (inFlight.current) return false; inFlight.current = true; setBusy(true); return true }} release={() => { inFlight.current = false; setBusy(false) }} /></Suspense></div>}
          {view === 'assistant' && mode === 'joint' && <p role="status">AI actions are disabled for joint scheduling because AI explanations currently recompute EV-only results. Select EV-only to use the assistant.</p>}
          {view === 'assistant' && mode === 'ev_only' && <EnergyAssistant onCompareProposal={next => { setWhatIfSession(session => session + 1); setAlternative(next); setWhatIfVisited(true); setView('whatif') }} editor={editor} onChange={setEditor} resultScenario={resultScenario} />}
          <footer>
            <span>GridPilot · Commercial energy intelligence</span>
            <span>
              Building-local hours · USD · No verified savings without solver
              results
            </span>
          </footer>
        </main>
      </div>
    </div>
  )
}
