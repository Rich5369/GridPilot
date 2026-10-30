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
type Advisor = Omit<Proposal, 'status'> & { category: 'answer' | 'clarification_required' | 'scenario_proposal' | 'unavailable_or_unsupported'; facts: string[]; profile: Profile }

const examples = ['Keep peak power demand below 15 kW.', 'Make sure both EVs finish charging by 5 PM.', 'What happens if peak electricity prices increase by 25%?']
export function EnergyAssistant({ editor, onChange, resultScenario, onCompareProposal, schedulingMode = 'ev_only' }: {
  schedulingMode?: 'ev_only' | 'joint'; editor: ScenarioEditor; onChange: (editor: ScenarioEditor) => void; resultScenario: Scenario | null; onCompareProposal?: (e: ScenarioEditor) => void
}) {
  const [request, setRequest] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [snapshot, setSnapshot] = useState('')
  const [history, setHistory] = useState<{role: 'user' | 'assistant'; content: string}[]>([])
  const [profile, setProfile] = useState<Profile>({})
  const [source, setSource] = useState('Verification pending')
  const [conversation, setConversation] = useState('')
  const validDraft = !Object.keys(validateEditor(editor)).length
  const draftScenario = validDraft ? toScenario(editor) : null
  const contextKey = JSON.stringify(resultScenario ?? draftScenario) + schedulingMode
  const contextRef = useRef(contextKey)
  useEffect(() => { contextRef.current = contextKey }, [contextKey])
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
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
      const body = { request, history: prior.slice(-12), profile, scenario: resultScenario ?? toScenario(editor), scheduling_mode: schedulingMode }
      const response = await apiRequest<Advisor>('/api/ai/conversation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      })
      if (contextRef.current !== submittedKey) { setError('Scenario changed during the request. Please send again.'); return }
      setConversation(submittedKey)
      setHistory([...prior, { role: 'user', content: request }, { role: 'assistant', content: [response.message, ...(response.facts ?? [])].join('\n\n').slice(0, 3000) }].slice(-12) as typeof history)
      setProfile(response.profile ?? {})
      setSource(response.source === 'meta' ? 'Meta inference verified for last reply' : 'MOCK MODE — NOT META AI')
      if (response.category === 'scenario_proposal') setProposal({ ...response, status: 'proposed' })
    } catch (e) {
      const detail = e instanceof ApiError ? (e.body as { detail?: { message?: string } })?.detail?.message : null
      setSource('Meta unavailable · last request failed')
      setError(detail || 'AI request failed or timed out. Optimization remains available.')
    } finally { setBusy(false); pending.current = false }
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
    <div className="section-heading"><h2>GridPilot Energy Advisor</h2><span className="tag" role="status">{source}</span></div>
    <p className="muted">Explore your submitted scenario with Meta Muse Spark. Business background stays separate from engineering inputs. Only the optimizer calculates outcomes.</p>
    <details><summary>Business context · inspect and correct</summary>
      <p className="muted">Session only. Describe your business in a message to extract context. Unknown fields stay blank.</p>
      {['business_type', 'employee_count', 'operating_hours', 'electricity_cost_and_period', 'consumption_and_units', 'equipment', 'goals', 'restrictions'].map(key => <label key={key}>{key.replaceAll('_', ' ')}<input type={key === 'employee_count' ? 'number' : 'text'} min="0" maxLength={key === 'business_type' ? 120 : key === 'equipment' || key === 'goals' || key === 'restrictions' ? 500 : 200} value={profile[key] ?? ''} onChange={e => setProfile(p => ({...p, [key]: e.target.value === '' ? null : key === 'employee_count' ? Number(e.target.value) : e.target.value}))} /></label>)}
    </details>
    <div className="ai-examples">{['What are my modeled electricity costs?', 'When is peak building demand?', ...examples].map(text => <button key={text} onClick={() => setRequest(text)} disabled={busy}>{text}</button>)}</div>
    {conversation && conversation !== contextKey && <p role="status">Submitted context changed. Your next message starts a new conversation.</p>}
    <div className="advisor-history" role="log" aria-label="Energy advisor conversation" aria-live="polite">{history.map((turn, i) => <article className={`advisor-message ${turn.role}`} key={i}><strong>{turn.role === 'user' ? 'You' : 'Energy Advisor'}</strong><p style={{whiteSpace: 'pre-wrap'}}>{turn.content}</p></article>)}</div>
    <form onSubmit={e => { e.preventDefault(); void send() }}>
      <label htmlFor="ai-request">Ask about energy or describe your business</label>
      <textarea id="ai-request" value={request} maxLength={2000} onChange={e => setRequest(e.target.value)} rows={3} required />
      <div className="ai-actions"><button className="run-button" type="submit" disabled={busy || !request.trim() || (!resultScenario && !!Object.keys(validateEditor(editor)).length)}>Send to advisor</button>
      <button type="button" disabled={busy} onClick={() => { setHistory([]); setProposal(null); setError('') }}>Clear conversation</button></div>
    </form>
    {busy && <p role="status">Requesting Meta assistance…</p>}
    {error && <p role="status">{error} Retry with Send to advisor.</p>}
    {proposal && <div className="advisor-proposal" aria-label="Proposed scenario changes"><h3>Proposed operational change</h3><p>{proposal.message}</p>
      <dl>{Object.entries(proposal.changes).filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt>{k.replaceAll('_', ' ')}</dt><dd>{v}</dd></div>)}</dl>
      {stale && <p>Draft differs from submitted context. Restore the submitted draft or request a new proposal after submitting it.</p>}
      <button onClick={() => apply()} disabled={stale || busy}>Apply Changes</button> {onCompareProposal && <button onClick={() => apply(true)} disabled={stale || busy}>Compare as alternative</button>} <button onClick={() => setProposal(null)}>Cancel</button>
    </div>}
  </section>
}
