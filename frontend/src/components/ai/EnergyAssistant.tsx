import { useRef, useState } from 'react'
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
type Explanation = { source: 'meta' | 'mock'; explanation: string[]; limitations: string }
const examples = ['Keep peak power demand below 15 kW.', 'Make sure both EVs finish charging by 5 PM.', 'What happens if peak electricity prices increase by 25%?']
export function EnergyAssistant({ editor, onChange, resultScenario }: {
  editor: ScenarioEditor; onChange: (editor: ScenarioEditor) => void; resultScenario: Scenario | null
}) {
  const [request, setRequest] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [snapshot, setSnapshot] = useState('')
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [error, setError] = useState('')
  async function send(kind: 'interpret' | 'explain') {
    if (pending.current) return
    pending.current = true
    setBusy(true); setError(''); setProposal(null); setExplanation(null)
    const current = JSON.stringify(editor)
    setSnapshot(current)
    try {
      const body = kind === 'interpret' ? { request, scenario: toScenario(editor) } : { scenario: resultScenario }
      const response = await apiRequest<Proposal | Explanation>(`/api/ai/${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      })
      if (kind === 'interpret') setProposal(response as Proposal)
      else setExplanation(response as Explanation)
    } catch (e) {
      const detail = e instanceof ApiError ? (e.body as { detail?: { message?: string } })?.detail?.message : null
      setError(detail || 'AI request failed or timed out. Optimization remains available.')
    } finally { setBusy(false); pending.current = false }
  }
  function apply() {
    if (!proposal?.proposed_scenario || snapshot !== JSON.stringify(editor)) return
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
    onChange(next); setProposal(null); setExplanation(null)
    setError('Changes applied to draft. Run optimization to calculate feasibility and results.')
  }
  const stale = snapshot !== JSON.stringify(editor)
  return <section className="panel assistant">
    <div className="section-heading"><h2>AI Energy Assistant</h2><span className="tag">{proposal?.source === 'mock' || explanation?.source === 'mock' ? 'MOCK MODE — NOT META AI' : 'META API · LIVE VERIFICATION PENDING'}</span></div>
    <p className="muted">Review proposals before applying. Supports building demand limits, a shared EV deadline, and percentage changes to the highest tariff rate. Other requests may need clarification.</p>
    <div className="ai-examples">{examples.map(text => <button key={text} onClick={() => setRequest(text)} disabled={busy}>{text}</button>)}</div>
    <label htmlFor="ai-request">Business request</label>
    <textarea id="ai-request" value={request} maxLength={2000} onChange={e => { setRequest(e.target.value); setProposal(null) }} rows={3} />
    <div className="ai-actions"><button className="run-button" disabled={busy || !request.trim() || !!Object.keys(validateEditor(editor)).length} onClick={() => send('interpret')}>Review proposed changes</button>
    <button disabled={busy || !resultScenario} onClick={() => send('explain')}>Explain latest backend result</button></div>
    {busy && <p role="status">Requesting AI assistance…</p>}
    {error && <p role="status">{error}</p>}
    {proposal && <div aria-label="Proposed scenario changes"><p><strong>{proposal.source === 'mock' ? 'Mock fixture — not a Meta AI response' : 'Meta AI proposal'}</strong></p><p>{proposal.message}</p>
      <dl>{Object.entries(proposal.changes).filter(([, v]) => v != null).map(([k, v]) => <div key={k}><dt>{k.replaceAll('_', ' ')}</dt><dd>{v}</dd></div>)}</dl>
      {stale && <p>Draft changed. Request a new proposal.</p>}
      {proposal.status === 'proposed' && <button onClick={apply} disabled={stale || busy}>Apply Changes</button>} <button onClick={() => setProposal(null)}>Cancel</button>
    </div>}
    {explanation && <div aria-label="Result explanation"><h3>{explanation.source === 'mock' ? 'Mock selection — not Meta AI' : 'Meta AI selected, verified result facts'}</h3><p>Recomputed for the latest submitted scenario; current draft edits are excluded.</p>{explanation.explanation.map(p => <p key={p}>{p}</p>)}<p className="muted">{explanation.limitations}</p></div>}
  </section>
}
