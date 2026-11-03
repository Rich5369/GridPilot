import { RefreshCw } from 'lucide-react'
import { useBackendHealth } from '../hooks/useBackendHealth'

export function BackendStatus() {
  const { status, retry } = useBackendHealth()
  return <div className="connection">
    <span role="status" className={`status ${status}`}>
      <span className="status-dot" />
      {status === 'connected' ? 'Backend connected' : status === 'checking' ? 'Connecting to backend…' : status === 'waking' ? 'Backend waking up… Allow up to a minute.' : 'Backend unavailable · retry connection'}
    </span>
    <button className="icon-button" onClick={retry} disabled={status === 'checking' || status === 'waking'} aria-label="Retry backend connection" title="Retry connection"><RefreshCw size={15} /></button>
  </div>
}
