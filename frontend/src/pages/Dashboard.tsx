import { DemandChart } from '../components/DemandChart'
import examplePlan from '../data/examplePlan.json'
import { Overview } from '../components/dashboard/Overview'
import type { SavingsDraft } from '../types/savings'
import { exportEvidence } from '../services/exportEvidence'
import { AnalysisSelect } from '../components/configuration/AnalysisSelect'
import { analysisLabel, effectiveMode } from '../data/analysisOptions'
import type { InitialCalculation } from '../types/initialCalculation'
import { OperatingTimeline } from '../components/dashboard/OperatingTimeline'
import {
  lazy,
  Suspense,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from 'react'
import {
  Building2,
  Globe2,
  GitCompareArrows,
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'
import { ElectricityPriceExplorer } from '../components/dashboard/ElectricityPriceExplorer'
import {
  ScenarioAnalytics,
} from '../components/dashboard/CommandAnalytics'
import { BackendStatus } from '../components/BackendStatus'
import { EnergyInsights } from '../components/dashboard/EnergyInsights'
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
import type { DashboardView } from '../services/navigation'
import type { ScenarioEditor } from '../types/dashboard'
import type { Scenario, OptimizationResult } from '../types/api'
const SavingsOpportunities = lazy(() =>
  import('../components/savings/SavingsOpportunities').then((m) => ({
    default: m.SavingsOpportunities,
  })),
)
const Comparison = lazy(() =>
  import('../components/dashboard/Comparison').then((module) => ({
    default: module.Comparison,
  })),
)
const WhatIf = lazy(() =>
  import('../components/dashboard/WhatIf').then((m) => ({ default: m.WhatIf })),
)
const views = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  {
    id: 'configuration',
    label: 'Energy plan',
    icon: SlidersHorizontal,
  },
  { id: 'savings', label: 'Savings opportunities', icon: Sparkles },
  { id: 'building', label: 'My building', icon: Building2 },
  { id: 'comparison', label: 'Optimization', icon: GitCompareArrows },
  { id: 'whatif', label: 'What-if scenarios', icon: GitCompareArrows },
  { id: 'assistant', label: 'Energy Advisor', icon: Sparkles },
  { id: 'markets', label: 'Electricity markets', icon: Globe2 },
] as const
export function Dashboard({
  preview = false,
  initialEditor,
  initialMode = 'ev_only',
  workspaceName = 'Scenario workspace',
  businessProfile,
  onSetup,
  workspaceControls,
  onInputsChange,
  onBusinessContextChange,
  businessContextLabel,
  selectedView,
  onNavigate,
  initialCalculation,
  initialSavingsDraft,
  onSavingsDraftChange,
  onInitialSettled,
  resumed = false,
}: {
  initialSavingsDraft?: SavingsDraft
  onSavingsDraftChange?: (draft: SavingsDraft) => void
  initialCalculation?: InitialCalculation | null
  onInitialSettled?: () => void
  selectedView?: DashboardView
  onNavigate?: (view: DashboardView) => void
  onBusinessContextChange?: (
    profile: Record<string, string | number | null>,
  ) => void
  businessContextLabel?: string
  workspaceControls?: ReactNode
  onInputsChange?: (editor: ScenarioEditor, mode: SchedulingMode) => void
  resumed?: boolean
  initialEditor?: ScenarioEditor
  initialMode?: SchedulingMode
  workspaceName?: string
  businessProfile?: Record<string, string | number | null>
  onSetup?: (editor: ScenarioEditor, mode: SchedulingMode) => void
  preview?: boolean
} = {}) {
  const [mode, setMode] = useState<SchedulingMode>(
    effectiveMode(initialEditor ?? defaultEditor, initialMode),
  )
  const modeVersion = useRef(0)
  const [modeRevision, setModeRevision] = useState(0)
  const [resultMode, setResultMode] = useState<SchedulingMode>(initialMode)
  const [billingInputs, setBillingInputs] = useState(defaultBillingInputs)
  const [appliedBilling, setAppliedBilling] = useState(defaultBillingInputs)
  const [localView, setLocalView] = useState<DashboardView>('overview')
  const view = selectedView ?? localView
  const [savingsVisited, setSavingsVisited] = useState(view === 'savings')
  if (view === 'savings' && !savingsVisited) setSavingsVisited(true)
  const previousView = useRef<DashboardView>('overview')
  const advisorTrigger = useRef<HTMLButtonElement>(null)
  const advisorClose = useRef<HTMLButtonElement>(null)
  const wasAdvisor = useRef(false)
  useEffect(() => {
    if (view === 'assistant') {
      if (!wasAdvisor.current) advisorClose.current?.focus()
    } else {
      previousView.current = view
      if (wasAdvisor.current) advisorTrigger.current?.focus()
    }
    wasAdvisor.current = view === 'assistant'
  }, [view])
  function closeAdvisor() {
    setView(previousView.current)
  }
  const primaryView = ['configuration', 'comparison', 'whatif'].includes(view) ? 'configuration' : view
  function setView(next: DashboardView) {
    setLocalView(next)
    onNavigate?.(next)
  }
  const [editor, setEditorState] = useState({
    ...(initialEditor ?? defaultEditor),
  })
  function setEditor(next: ScenarioEditor) {
    const nextMode = effectiveMode(next, mode)
    if (nextMode !== mode) {
      modeVersion.current += 1
      setModeRevision(modeVersion.current)
      setMode(nextMode)
    }
    setEditorState(next)
    onInputsChange?.(next, nextMode)
  }
  const [alternative, setAlternative] = useState<ScenarioEditor | null>(null)
  // An AI handoff starts a new comparison and captures the current Restore snapshot.
  const [whatIfSession, setWhatIfSession] = useState(0)
  const [result, setResult] = useState<OptimizationResult | null>(preview ? examplePlan.result as OptimizationResult : null)
  const [submitted, setSubmitted] = useState(preview ? JSON.stringify(initialEditor ?? defaultEditor) : '')
  const [resultScenario, setResultScenario] = useState<Scenario | null>(preview ? examplePlan.scenario : null)
  const [busy, setBusy] = useState(Boolean(initialCalculation))
  const inFlight = useRef(Boolean(initialCalculation))
  const [example, setExample] = useState(preview)
  const [message, setMessage] = useState('')
  const invalid = Object.keys(validateEditor(editor)).length > 0
  const stale = Boolean(result) && submitted !== JSON.stringify(editor)
  const submittedEditor: ScenarioEditor | null =
    result && submitted ? JSON.parse(submitted) : null
  useEffect(() => {
    if (!initialCalculation) return
    let active = true
    const version = modeVersion.current
    const initial = initialCalculation
    void initial.promise
      .then(
        (response) => {
          if (!active || modeVersion.current !== version) return
          setResultMode(initial.mode)
          setResult(response)
          setResultScenario(initial.scenario)
          setSubmitted(JSON.stringify(initial.editor))
          setMessage('Backend result received for the submitted scenario.')
          // Stay in the section selected by the user; initial setup opens Overview.
        },
        (error) => {
          if (active && modeVersion.current === version)
            setMessage(optimizationError(error))
        },
      )
      .finally(() => {
        if (active) {
          inFlight.current = false
          setBusy(false)
          onInitialSettled?.()
        }
      })
    return () => {
      active = false
    }
    // This subscribes to one event-started request; it never initiates a solve.
  }, [initialCalculation, onInitialSettled])
  async function runOptimization() {
    if (invalid || inFlight.current) return
    inFlight.current = true
    const snapshot = JSON.stringify(editor)
    const version = modeVersion.current
    const submittedMode = mode
    if (example) { setExample(false); setResult(null); setResultScenario(null); }
    setBusy(true)
    setMessage('')
    try {
      const response = await optimizeScenario(toScenario(editor), submittedMode)
      if (version !== modeVersion.current) return
      setResultMode(submittedMode)
      setResult(response)
      setResultScenario(toScenario(JSON.parse(snapshot)))
      setSubmitted(snapshot)
      setView('overview')
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
      <a
        className="skip-link"
        href="#workspace-main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('workspace-main')?.focus()
        }}
      >
        Skip to main content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          aria-label="GridPilot home"
        >
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          GridPilot<span className="brand-period">.</span>
        </a>
        <div className="workspace">
          <Building2 size={20} />
          <div>
            <strong>{workspaceName}</strong>
            <span>Building energy workspace</span>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {views.filter(({ id }) => ['overview', 'savings', 'configuration', 'building'].includes(id)).sort((a, b) => ['overview', 'savings', 'configuration', 'building'].indexOf(a.id) - ['overview', 'savings', 'configuration', 'building'].indexOf(b.id)).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={primaryView === id ? 'nav-active' : 'nav-item'}
              aria-current={primaryView === id ? 'page' : undefined}
              onClick={() => {
                setView(id)
              }}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar">GP</span>
          <div>
            <strong>{workspaceName}</strong>
            <span>Saved building inputs</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>
            <strong>{views.find((v) => v.id === view)?.label}</strong>
          </span>
          <div className="topbar-actions">
            {onSetup && (
              <button
                className="secondary"
                onClick={() => onSetup(editor, mode)}
              >
                Edit building
              </button>
            )}
            {workspaceControls}
            <BackendStatus />
          </div>
        </header>
        <main id="workspace-main" tabIndex={-1} onKeyDown={event => {
          if (view === 'assistant' && event.key === 'Escape') {
            event.preventDefault()
            closeAdvisor()
          }
        }}>
          {example && <section className="panel example-notice"><h2>Example snapshot · synthetic building</h2><p>This checked local optimizer result is an illustration, not a fresh calculation for your building. Its rates are synthetic assumptions: $0.12/kWh off peak and $0.28/kWh from 2 PM–8 PM; no market date or customer tariff is claimed.</p><details><summary>Example inputs, device schedules and calculation quality</summary><pre>{JSON.stringify(examplePlan, null, 2)}</pre></details><p>Run a real calculation before requesting advice about an exact backend result. No saved result identifier is used.</p></section>}
          {view !== 'savings' && resumed && !result && (
            <p className="workspace-result-notice" role="status">
              Building inputs restored. No optimizer result has been restored.
              Calculate energy plan explicitly to calculate a new schedule.
            </p>
          )}
          <div className="page-heading">
            <div>
              <h1>
                {view === 'overview'
                  ? 'Energy overview'
                  : views.find((v) => v.id === view)?.label}
              </h1>
              <p className="muted">
                <span className="workspace-name">{workspaceName}</span>
              </p>
            </div>
            <div className="page-heading-actions">
              {view === 'assistant' ? (
                <button ref={advisorClose} className="secondary" onClick={closeAdvisor}>Close Energy Advisor</button>
              ) : (
                <button ref={advisorTrigger} className="run-button advisor-trigger" aria-controls="energy-advisor" onClick={() => setView('assistant')}>
                  <Sparkles size={17} aria-hidden="true" />Ask Meta Energy Advisor
                </button>
              )}
              {['overview', 'configuration', 'comparison', 'whatif'].includes(view) && (
                <button
                  className="secondary calculate-plan"
                  onClick={runOptimization}
                  disabled={busy || invalid}
                  aria-busy={busy}
                  aria-describedby="optimization-help"
                >
                  <Zap size={17} />
                  {busy ? 'Calculating energy plan…' : 'Calculate energy plan'}
                </button>
              )}
            </div>
          </div>
          {['configuration', 'comparison', 'whatif'].includes(view) && <nav className="plan-tabs" aria-label="Energy plan views">{[['configuration', 'Inputs'], ['comparison', 'Results and equipment'], ['whatif', 'What-if comparisons']].map(([id, label]) => <button key={id} className="secondary" aria-current={view === id ? 'page' : undefined} onClick={() => setView(id as DashboardView)}>{label}</button>)}</nav>}
          <div hidden={!['configuration', 'comparison', 'whatif'].includes(view)}>
            <section className="workflow" aria-label="Energy planning workflow">
              <div
                className={`workflow-status ${stale ? 'is-stale' : ''}`}
                role="status"
              >
                {busy
                  ? 'Calculating your submitted scenario…'
                  : !result
                    ? 'Ready to configure · No backend result yet'
                    : stale
                      ? 'Inputs changed · Calculate energy plan to update your results'
                      : `Result available · ${analysisLabel(submittedEditor ?? editor, resultMode)} · ${result.feasibility_status}`}
              </div>
              <div className="workflow-actions">
                <button
                  className="secondary"
                  onClick={() => setView('configuration')}
                >
                  1. Configure scenario
                </button>
                <button
                  className="secondary"
                  onClick={() => setView('comparison')}
                >
                  2. Review results
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setView('whatif')
                  }}
                >
                  3. Compare alternatives
                </button>
              </div>
            </section>
            <div className="mode-control field">
              <AnalysisSelect
                describedBy="scheduling-assumptions-label"
                editor={editor}
                mode={mode}
                onChange={(next, nextMode) => {
                  modeVersion.current += 1
                  setModeRevision(modeVersion.current)
                  setMode(nextMode)
                  setEditorState(next)
                  onInputsChange?.(next, nextMode)
                  setResult(null)
                  setResultScenario(null)
                  setMessage('Analysis changed. Run again for new results.')
                }}
              />
              <details className="mode-explanation">
                <summary id="scheduling-assumptions-label">
                  Scheduling assumptions · {analysisLabel(editor, mode)}
                </summary>
                <p>
                  {mode === 'ev_only'
                    ? 'Moves EV charging within arrival and completion times. Equipment and fixed building demand stay unchanged.'
                    : 'Moves EV charging and eligible equipment within their allowed windows. Flexible equipment is modeled as interruptible and continuously adjustable: it can pause and vary power. Uninterrupted machine cycles are not modeled. Fixed building demand stays unchanged.'}
                </p>
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
              <div
                className={
                  message ===
                  'Backend result received for the submitted scenario.'
                    ? 'sr-only'
                    : 'request-message'
                }
                role="status"
              >
                {message}
              </div>
            )}
          </div>
          {savingsVisited && <div hidden={view !== 'savings'}>
            <Suspense
              fallback={<p role="status">Loading savings workspace…</p>}
            >
              <SavingsOpportunities
                workspaceName={workspaceName}
                businessProfile={businessProfile}
                onProfileChange={onBusinessContextChange}
                initialDraft={initialSavingsDraft}
                onDraftChange={onSavingsDraftChange}
                onScheduling={() => setView('configuration')}
              />
            </Suspense>
          </div>}
          {view === 'building' && <section className="panel building-summary">
            <h2>About your building</h2>
            <p>{workspaceName} · {String(businessProfile?.business_type ?? 'Business type not provided')}</p>
            <p>Operating hours: {String(businessProfile?.operating_hours ?? 'Not provided')}</p>
            <p>Equipment: {String(businessProfile?.equipment ?? 'Review equipment in your energy inputs or confirm it in Savings opportunities.')}</p>
            <p>Electricity spending: {String(businessProfile?.electricity_cost_and_period ?? 'Not provided')} · Spending does not establish an electricity rate.</p>
            <div className="plan-tabs">
              <button className="secondary" onClick={() => onSetup?.(editor, mode)}>Edit building information</button>
              <button className="secondary" onClick={() => setView('configuration')}>Equipment, hourly demand and rates</button>
              <button className="secondary" onClick={() => setView('markets')}>Electricity market information</button>
            </div>
            <p>Inputs are retained in this browser. Accounts and cross-device synchronization are not provided.</p>
          </section>}
          {view === 'overview' && <Overview result={result} scenario={resultScenario} stale={stale} busy={busy} invalid={invalid} message={message} onNavigate={setView} />}
          {view === 'markets' && <ElectricityPriceExplorer />}
          <div>
            <div
              className={
                view === 'assistant' ? 'advisor-main-hidden' : 'command-primary'
              }
            >
              {view === 'comparison' && (
                <>
                  <Suspense fallback={<p role="status">Loading comparison…</p>}>
                    <Comparison
                      fixedDemand={resultScenario?.fixed_demand_kw}
                      result={result}
                      limit={resultScenario?.building_max_demand_kw}
                      stale={stale}
                    />
                  </Suspense>
                  {(resultScenario || !invalid) && (
                    <ScenarioAnalytics
                      scenario={resultScenario ?? toScenario(editor)}
                      result={result}
                      draft={!resultScenario}
                    />
                  )}
                  {resultScenario &&
                    resultScenario.ev_requirements.length +
                      (resultScenario.flexible_equipment?.length ?? 0) >
                      0 && (
                      <OperatingTimeline
                        key={JSON.stringify(result)}
                        result={result}
                        scenario={resultScenario}
                        mode={resultMode}
                        stale={stale}
                        customEquipment={submittedEditor?.customEquipment}
                      />
                    )}
                  {resultScenario &&
                    !resultScenario.ev_requirements.length &&
                    !resultScenario.flexible_equipment?.length && (
                      <div className="panel fixed-only-note">
                        <p>
                          No schedulable equipment is configured; this analysis
                          reflects your building’s fixed electricity use. Site
                          limits still apply.
                        </p>
                        {result && (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              exportEvidence(
                                resultScenario,
                                result,
                                resultMode,
                                submittedEditor?.customEquipment,
                              )
                            }
                          >
                            Export submitted evidence
                          </button>
                        )}
                      </div>
                    )}
                  <EnergyInsights
                    scenario={resultScenario}
                    result={result}
                    stale={stale}
                    mode={resultMode}
                  />
                  <ScenarioSummary
                    editor={editor}
                    mode={mode}
                    label="Editable draft"
                    onEdit={() => setView('configuration')}
                  />
                  {submittedEditor && (
                    <details className="panel result-details">
                      <summary>
                        Submitted scenario &amp; result provenance
                      </summary>
                      <p>Displayed result mode: {modeLabel(resultMode)}</p>
                      <p className="profile-provenance">
                        Optimizer-calculated result · Submitted inputs:{' '}
                        {profileSource(submittedEditor)}
                      </p>
                      <ScenarioSummary
                        editor={submittedEditor}
                        mode={resultMode}
                        label="Submitted snapshot"
                      />
                      <p>
                        Energy charges exclude fixed and demand charges. Solver
                        results describe modeled constraints, not verified
                        building operation.
                      </p>
                    </details>
                  )}
                  {!result && !invalid && (
                    <section className="panel draft-preview">
                      <p className="eyebrow">
                        DRAFT INPUTS · NOT AN OPTIMIZATION RESULT
                      </p>
                      <h2>Your building demand</h2>
                      <p>
                        Fixed demand only. EV charging and flexible equipment
                        are included after optimization.
                      </p>
                      <Suspense
                        fallback={
                          <p role="status">Loading fixed demand chart…</p>
                        }
                      >
                        <DemandChart
                          total={{
                            key: 'fixed-total',
                            label: 'Fixed building demand',
                            values: fixedDemand(editor),
                          }}
                          limit={Number(editor.limit)}
                        />
                      </Suspense>
                    </section>
                  )}
                  {result && (
                    <details className="panel result-details">
                      <summary>Explore baseline billing assumptions</summary>
                      <p>
                        Baseline from the submitted result
                        {stale ? ' (previous scenario)' : ''}. Additional
                        charges below are manually entered estimates.
                      </p>
                      <CostBreakdown
                        energy={result.baseline_electricity_cost_usd}
                        inputs={billingInputs}
                        setInputs={setBillingInputs}
                        applied={appliedBilling}
                        setApplied={setAppliedBilling}
                      />
                    </details>
                  )}
                </>
              )}
              {view === 'configuration' && (
                <>
                  <ScenarioPanel editor={editor} onChange={setEditor} />
                  {!invalid && (
                    <Suspense
                      fallback={
                        <p role="status">Loading fixed demand chart…</p>
                      }
                    >
                      <section className="panel demand-preview">
                        <h2>Fixed building demand preview</h2>
                        <p>
                          Draft inputs only · excludes vehicle charging and
                          shiftable equipment schedules. Calculate energy plan to see
                          whole-building demand.
                        </p>
                        <DemandChart
                          total={{
                            key: 'fixed-total',
                            label: 'Fixed building demand',
                            values: fixedDemand(editor),
                          }}
                          limit={Number(editor.limit)}
                          sources={
                            editor.demandProfile?.mode === 'sources'
                              ? editor.demandProfile.sources?.map(
                                  (source, i) => ({
                                    key: `source-${i}`,
                                    label: `${source.category} · fixed`,
                                    values: source.values.map(Number),
                                  }),
                                )
                              : [
                                  {
                                    key: 'combined',
                                    label:
                                      'Combined / unallocated fixed demand',
                                    values: fixedDemand(editor),
                                  },
                                ]
                          }
                        />
                      </section>
                    </Suspense>
                  )}
                </>
              )}
              {
                <div hidden={view !== 'whatif'}>
                  <Suspense
                    fallback={<p role="status">Loading what-if comparison…</p>}
                  >
                    <WhatIf
                      key={whatIfSession}
                      modeRevision={modeRevision}
                      mode={mode}
                      editor={editor}
                      onChange={setEditor}
                      alternative={alternative}
                      setAlternative={setAlternative}
                      busy={busy}
                      acquire={() => {
                        if (inFlight.current) return false
                        inFlight.current = true
                        setBusy(true)
                        return true
                      }}
                      release={() => {
                        inFlight.current = false
                        setBusy(false)
                      }}
                    />
                  </Suspense>
                </div>
              }
            </div>
            <aside
              className={
                view === 'overview' ? 'command-advisor' : 'full-advisor'
              }
              hidden={view !== 'assistant'}
              id="energy-advisor"
              aria-label="Energy Advisor"
            >
              <EnergyAssistant
                schedulingMode={result ? resultMode : mode}
                onCompareProposal={(next) => {
                  setWhatIfSession((session) => session + 1)
                  setAlternative(next)
                  setView('whatif')
                }}
                editor={editor}
                onChange={setEditor}
                resultScenario={example ? null : resultScenario}
                resultId={example ? undefined : result?.result_id}
                initialProfile={businessProfile}
                onProfileChange={onBusinessContextChange}
                initialProfileLabel={businessContextLabel}
              />
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
