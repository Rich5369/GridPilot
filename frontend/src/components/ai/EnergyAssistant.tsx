import { useEffect, useRef, useState } from 'react'
import { apiRequest, ApiError } from '../../services/api'
import { toScenario, validateEditor } from '../../data/demoScenario'
import type { ScenarioEditor } from '../../types/dashboard'
import type { Scenario } from '../../types/api'

type Proposal = {
  source: 'meta' | 'mock'
  status: 'proposed' | 'clarification' | 'unsupported'
  message: string
  changes: { building_max_demand_kw?: number | null; all_ev_deadline_hour?: number | null; peak_price_increase_percent?: number | null }
  proposed_scenario: Scenario | null
}
type Profile = Record<string, string | number | null>
type Advisor = Omit<Proposal, 'status'> & { category: 'answer' | 'clarification_required' | 'scenario_proposal' | 'unavailable_or_unsupported'; facts: string[]; follow_up_questions?: string[]; missing_information?: string[]; profile: Profile }

const profileFields = ['business_type', 'employee_count', 'operating_hours', 'electricity_cost_and_period', 'consumption_and_units', 'equipment', 'goals', 'restrictions']
const fieldLabel = (key: string) => ({ electricity_cost_and_period: 'Electricity cost & billing period', consumption_and_units: 'Consumption & units' }[key] ?? key.replaceAll('_', ' '))
const examples = ['Keep peak power demand below 15 kW.', 'Compare a lower power-cap scenario.']
export function EnergyAssistant({ editor, onChange, resultScenario, onCompareProposal, schedulingMode = 'ev_only', resultId, initialProfile, onProfileChange, initialProfileLabel = 'From setup' }: {
  onProfileChange?: (profile: Profile) => void; initialProfileLabel?: string; initialProfile?: Profile; resultId?: string | null; schedulingMode?: 'ev_only' | 'joint'; editor: ScenarioEditor; onChange: (editor: ScenarioEditor) => void; resultScenario: Scenario | null; onCompareProposal?: (e: ScenarioEditor) => void
}) {
  const [request, setRequest] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [snapshot, setSnapshot] = useState('')
  const [history, setHistory] = useState<{role: 'user' | 'assistant'; content: string; category?: Advisor['category']; message?: string; facts?: string[]; questions?: string[]}[]>([])
  const [profile, setProfile] = useState<Profile>(initialProfile ?? {})
  const [edited, setEdited] = useState<Profile>({})
  // User corrections made while a reply is pending take precedence over extraction.
  const editedRef = useRef<Profile>({})
  const [source, setSource] = useState('No advisor reply yet')
  const [conversation, setConversation] = useState('')
  const validDraft = !Object.keys(validateEditor(editor)).length
  const draftScenario = validDraft ? toScenario(editor) : null
  const contextKey = JSON.stringify(resultScenario ?? draftScenario) + schedulingMode + (resultId ?? '')
  const contextRef = useRef(contextKey)
  useEffect(() => { contextRef.current = contextKey }, [contextKey])
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const [error, setError] = useState('')
  async function send() {
    if (pending.current || !request.trim() || (!resultScenario && !validDraft)) return
    pending.current = true
    setBusy(true); setError(''); setProposal(null)
    const submittedKey = contextKey
    const current = JSON.stringify(editor)
    setSnapshot(current)
    try {
      const prior = conversation === submittedKey ? history : []
      const body = { request, history: prior.slice(-12).map(({ role, content }) => ({ role, content })), profile, scenario: resultScenario ?? toScenario(editor), scheduling_mode: schedulingMode, result_id: resultId ?? null }
      const response = await apiRequest<Advisor>('/api/ai/conversation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      })
      if (!active.current) return
      if (contextRef.current !== submittedKey) { setError('Scenario changed during the request. Please send again.'); return }
      setConversation(submittedKey)
      setHistory([...prior, { role: 'user', content: request }, { role: 'assistant', category: response.category, message: response.message, facts: response.facts ?? [], questions: response.follow_up_questions ?? [], content: [response.message, ...(response.follow_up_questions ?? []), ...(response.facts ?? [])].join('\n\n').slice(0, 3000) }].slice(-12) as typeof history)
      const nextProfile = {...response.profile, ...editedRef.current}
      setProfile(nextProfile)
      onProfileChange?.(nextProfile)
      setSource(response.source === 'meta' ? 'Meta · reply received' : 'MOCK MODE — NOT META AI')
      if (response.category === 'scenario_proposal') setProposal({ ...response, status: 'proposed' })
    } catch (e) {
      if (!active.current) return
      const detail = e instanceof ApiError ? (e.body as { detail?: { message?: string } })?.detail?.message : null
      setSource('Meta unavailable · last request failed')
      setError(detail || 'AI request failed or timed out. Optimization remains available.')
    } finally { if (active.current) setBusy(false); pending.current = false }
  }
  function apply(compare = false) {
    if (stale || busy || !proposal?.proposed_scenario) return
    const changes = proposal.changes
    const next = { ...editor }
    if (changes.building_max_demand_kw != null) next.limit = String(changes.building_max_demand_kw)
    if (changes.all_ev_deadline_hour != null) next.deadline = String(changes.all_ev_deadline_hour)
    if (changes.peak_price_increase_percent != null) {
      const key = Number(editor.peak) > Number(editor.offPeak) ? 'peak' : 'offPeak'
      next[key] = String(Number(editor[key]) * (1 + changes.peak_price_increase_percent / 100))
    }
    // Require the editor adapter to round-trip exactly to the validated proposal.
    if (Object.keys(validateEditor(next)).length || Object.entries(toScenario(next)).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(proposal.proposed_scenario![key as keyof Scenario]))) {
      setError('This proposal cannot be represented by the current editor. No changes applied.'); return
    }
    if (compare) onCompareProposal?.(next); else onChange(next); setProposal(null)
    setError(compare ? 'Alternative prepared. Run Compare both scenarios in What-if to calculate outcomes.' : 'Changes applied to draft. Run optimization to calculate feasibility and results.')
  }
  const stale = snapshot !== JSON.stringify(editor) || JSON.stringify(draftScenario) !== JSON.stringify(resultScenario ?? draftScenario) || conversation !== contextKey
  return <section className="panel assistant advisor">
    <header className="advisor-header"><div><span className="advisor-eyebrow">ENERGY INTELLIGENCE</span><h2>GridPilot Energy Advisor</h2><p>Understand your energy use. Review your next move.</p></div><span className="tag" role="status">{source}</span></header>
    <p className="advisor-boundary">Guidance and proposals for your submitted scenario. Only the optimizer calculates outcomes.</p>
    <section className="advisor-context" aria-labelledby="business-context-heading">
      <div className="section-heading"><h3 id="business-context-heading">Business context</h3><span className="advisor-caption">Building context · conversations stay in this session</span></div>
      {profileFields.some(key => profile[key] != null && profile[key] !== '') ? <dl className="advisor-context-summary">{profileFields.filter(key => profile[key] != null && profile[key] !== '').map(key => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{profile[key]} <span className="advisor-provenance">{Object.hasOwn(edited, key) && edited[key] === profile[key] ? 'User edited' : initialProfile?.[key] != null && profile[key] === initialProfile[key] ? initialProfileLabel : 'Extracted'}</span></dd></div>)}</dl> : <p className="advisor-context-empty">No business details yet. Tell me about your operations, goals, or restrictions to add context.</p>}
      <details><summary>Edit business details <span className="advisor-caption">{profileFields.filter(key => profile[key] != null && profile[key] !== '').length} of 8 provided</span></summary>
        <p className="advisor-caption">Extracted details are unconfirmed excerpts from your messages. Review or correct them here; unknown details are optional.</p>
        <div className="advisor-fields">{profileFields.map(key => <label key={key}>{fieldLabel(key)}<input type={key === 'employee_count' ? 'number' : 'text'} placeholder="Not provided" min="0" maxLength={key === 'business_type' ? 120 : key === 'equipment' || key === 'goals' || key === 'restrictions' ? 500 : 200} value={profile[key] ?? ''} onChange={e => { const value = e.target.value === '' ? null : key === 'employee_count' ? Number(e.target.value) : e.target.value; const nextProfile = {...profile, [key]: value}; setProfile(nextProfile); onProfileChange?.(nextProfile); editedRef.current = {...editedRef.current, [key]: value}; setEdited(editedRef.current) }} /></label>)}</div>
      </details>
    </section>
    {conversation && conversation !== contextKey && <p role="status" className="advisor-notice">Submitted context changed. Your next message starts a new conversation.</p>}
    {!history.length && <div className="advisor-welcome"><h3>What would you like to explore?</h3><p>Start with a question or describe what matters to your business.</p></div>}
    <div className="advisor-history" role="log" aria-label="Energy advisor conversation" aria-live="polite" aria-busy={busy}>{history.map((turn, i) => <article className={`advisor-message ${turn.role} ${turn.category ?? ''}`} key={i}>
      <div className="advisor-message-heading"><strong>{turn.role === 'user' ? 'You' : 'Energy Advisor'}</strong>{turn.role === 'assistant' && <span>{turn.category === 'clarification_required' ? 'Clarification needed' : turn.category === 'scenario_proposal' ? 'Proposal · review required' : turn.category === 'unavailable_or_unsupported' ? 'Supported scope' : 'Scenario guidance'}</span>}</div>
      <p>{turn.message ?? turn.content}</p>
      {!!turn.questions?.length && <section aria-label="Follow-up questions"><h4>Next questions</h4><ul>{turn.questions.map(question => <li key={question}>{question}</li>)}</ul></section>}
      {!!turn.facts?.length && <section className="advisor-evidence" aria-label="Scenario evidence"><h4>Scenario evidence</h4>{turn.facts.map((fact, index) => <div className={fact.startsWith('Verified submitted ') ? 'advisor-verified' : 'advisor-fact'} key={index}>{fact.startsWith('Verified submitted ') && <span className="advisor-evidence-label">Verified solver result</span>}<p>{fact}</p></div>)}</section>}
    </article>)}</div>
    {proposal && <div className="advisor-proposal" aria-label="Proposed scenario changes"><span className="advisor-eyebrow">REVIEW SCENARIO CHANGES</span><h3>Proposed operational change</h3><p className="advisor-caption">Not yet applied · feasibility and savings have not been calculated for this proposal.</p><p>{proposal.message}</p>
      <dl>{Object.entries(proposal.changes).filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt>{{ building_max_demand_kw: 'Site power cap', all_ev_deadline_hour: 'All EVs ready by', peak_price_increase_percent: 'Highest tariff increase' }[k] ?? k}</dt><dd>{v}{k === 'building_max_demand_kw' ? ' kW' : k === 'all_ev_deadline_hour' ? ':00' : '%'}</dd></div>)}</dl>
      {stale && <p>Draft differs from submitted context. Restore the submitted draft or request a new proposal after submitting it.</p>}
      <button className="run-button" onClick={() => apply()} disabled={stale || busy}>Apply Changes</button> {onCompareProposal && <button onClick={() => apply(true)} disabled={stale || busy}>Compare as alternative</button>} <button onClick={() => setProposal(null)}>Cancel</button>
    </div>}
    <div className={`advisor-starters ${history.length ? 'has-history' : ''}`}><span className="advisor-caption">SUGGESTED QUESTIONS</span><div className="ai-examples">{['How can I reduce electricity costs without disrupting operations?', 'When is peak building demand?', 'What information do you need from me?', 'Explain this optimization result.', ...examples].map(text => <button type="button" key={text} onClick={() => setRequest(text)} disabled={busy}>{text}</button>)}</div></div>
    <form className="advisor-composer" onSubmit={e => { e.preventDefault(); void send() }}>
      <label htmlFor="ai-request">Ask about energy or describe your business</label>
      <textarea id="ai-request" value={request} maxLength={2000} onChange={e => setRequest(e.target.value)} rows={3} placeholder="Ask a question or describe your business goals…" aria-describedby="advisor-composer-help" required />
      <p id="advisor-composer-help" className="advisor-caption">Review any proposed changes before applying. Sending a message does not run optimization.</p>
      <div className="ai-actions"><button className="run-button" type="submit" disabled={busy || !request.trim() || (!resultScenario && !!Object.keys(validateEditor(editor)).length)}>Send to advisor</button>
      <button type="button" disabled={busy} onClick={() => { setHistory([]); setProposal(null); setError('') }}>Clear conversation</button></div>
    </form>
    {busy && <p className="advisor-notice" role="status">Requesting Meta assistance…</p>}
    {error && <p className="advisor-notice" role="status">{error}</p>}

  </section>
}
