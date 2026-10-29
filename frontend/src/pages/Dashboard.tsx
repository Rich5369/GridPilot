import { lazy, Suspense, useRef, useState } from 'react'
import {
  Activity,
  Building2,
  CircleDollarSign,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  PlugZap,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'
import { BackendStatus } from '../components/BackendStatus'
import { MetricCard } from '../components/MetricCard'
import { ScenarioPanel } from '../components/configuration/ScenarioPanel'
import {
  CostBreakdown,
  defaultBillingInputs,
} from '../components/dashboard/CostBreakdown'
import { EnergyAssistant } from '../components/ai/EnergyAssistant'
import {
  defaultEditor,
  demoResult,
  money,
  profileSource,
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
const EnergyChart = lazy(() =>
  import('../components/EnergyChart').then((module) => ({
    default: module.EnergyChart,
  })),
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
  const draftChanged = JSON.stringify(editor) !== JSON.stringify(defaultEditor)
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
            <strong>Northstar Office</strong>
            <span>Fictional commercial building</span>
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
                Northstar Office · Single-day planning workspace
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
            <p className="eyebrow">PLAN YOUR DAY</p>
            <h2>Shift energy use. Understand the tradeoffs.</h2>
            <p>Configure one day of demand, run the optimizer, then compare energy costs and peak power.</p>
            <ol>
              <li><button className="secondary" onClick={() => setView('configuration')} aria-current={view === 'configuration' ? 'step' : undefined}>1. Configure scenario</button></li>
              <li><button className="secondary" onClick={() => setView('comparison')} aria-current={view === 'comparison' ? 'step' : undefined}>2. Review results</button></li>
              <li><button className="secondary" onClick={() => { setWhatIfVisited(true); setView('whatif') }}>3. Compare alternatives</button></li>
            </ol>
            <p className="workflow-status" role="status">{busy ? 'Calculating your submitted scenario…' : !result ? 'Ready to configure · No backend result yet' : submitted !== JSON.stringify(editor) ? 'Inputs changed · Run optimization to update your results' : `Result available · ${modeLabel(resultMode)} · ${result.feasibility_status}`}</p>
          </section>
          <div className="mode-control field">
            <label htmlFor="scheduling-mode">Scheduling mode</label>
            <select id="scheduling-mode" value={mode} onChange={event => {
              modeVersion.current += 1
              setModeRevision(modeVersion.current)
              setMode(event.target.value as SchedulingMode)
              setResult(null); setResultScenario(null); setMessage('Scheduling mode changed. Run again for new results.')
            }}>
              <option value="ev_only">EV-only</option>
              <option value="joint">EV + flexible equipment</option>
            </select>
            <p>{mode === 'ev_only' ? 'Moves EV charging within arrival and completion times. Equipment and fixed building demand stay unchanged.' : 'Moves EV charging and eligible equipment within their allowed windows. Equipment can pause and vary power; uninterrupted machine cycles are not modeled. Fixed building demand stays unchanged.'}</p>
          </div>
          <p className="profile-provenance">Draft inputs: {profileSource(editor)}. Tariffs and equipment use your scenario settings.</p>
          {result && <>
            <p>Displayed result mode: {modeLabel(resultMode)}</p>
            <p className="profile-provenance">Optimizer-calculated result · Submitted inputs: {profileSource(JSON.parse(submitted))}</p>
          </>}
          <p id="optimization-help" className="action-help">
            {busy
              ? `Optimization is running. This request can take up to ${OPTIMIZATION_TIMEOUT_MS / 1000} seconds. Please wait.`
              : invalid
                ? 'Correct the scenario validation errors before submitting.'
                : 'Runs the current scenario on the backend. Results estimate one day of energy charges, excluding fixed and demand charges.'}
          </p>
          {message && (
            <div className="request-message" role="status">
              {message}
            </div>
          )}
          {view === 'overview' && <div className="demo-banner">
            <FlaskConical size={20} />
            <p>
              <strong>Demo Data.</strong> Overview charts and metrics use a
              deterministic fictional office profile, not a real simulation or
              solver result. Backend results, when available, appear separately
              under Optimization.
            </p>
            <span className="tag">DEMO DATA</span>
          </div>}
          {view === 'overview' && draftChanged && (
            <div className="draft-banner">
              Draft inputs differ from the displayed demo. Charts and costs
              retain the original fixture; editing inputs does not run a
              simulation.
            </div>
          )}
          {view === 'overview' && (
            <>
              <section className="metrics" aria-label="Calculated demo metrics">
                <MetricCard
                  title="Daily electricity consumption"
                  value={demoResult.energyKwh.toFixed(1)}
                  unit="kWh"
                  description="Calculated from 24 demo intervals"
                  icon={PlugZap}
                />
                <MetricCard
                  title="Daily energy charges"
                  value={money(demoResult.energyCostUsd)}
                  unit="USD"
                  description="Demo baseline · energy-only operating cost"
                  icon={CircleDollarSign}
                />
                <MetricCard
                  title="Maximum modeled demand"
                  value={demoResult.peakKw.toFixed(1)}
                  unit="kW"
                  description={`Displayed scenario limit: ${demoResult.scenario.building_max_demand_kw} kW`}
                  icon={Activity}
                />
              </section>
              <div className="scenario-strip">
                <span>
                  <Building2 size={16} />
                  Demo building limit{' '}
                  <strong>
                    {demoResult.scenario.building_max_demand_kw} kW
                  </strong>
                </span>
                <span>
                  Draft building limit <strong>{editor.limit || '—'} kW</strong>
                </span>
                <button onClick={() => setView('configuration')}>
                  Edit scenario →
                </button>
              </div>
              <div className="content-grid">
                <Suspense
                  fallback={
                    <div className="panel loading" role="status">
                      Loading demand chart…
                    </div>
                  }
                >
                  <EnergyChart result={demoResult} />
                </Suspense>
                <CostBreakdown
                  energy={demoResult.energyCostUsd}
                  inputs={billingInputs}
                  setInputs={setBillingInputs}
                  applied={appliedBilling}
                  setApplied={setAppliedBilling}
                />
              </div>
              <Suspense fallback={<p role="status">Loading comparison…</p>}>
                <Comparison
                  result={result}
                  stale={submitted !== JSON.stringify(editor)}
                />
              </Suspense>
            </>
          )}
          {view === 'configuration' && (
            <ScenarioPanel editor={editor} onChange={setEditor} />
          )}
          {view === 'comparison' && (
            <Suspense fallback={<p role="status">Loading comparison…</p>}>
              <Comparison
                result={result}
                stale={submitted !== JSON.stringify(editor)}
              />
            </Suspense>
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
