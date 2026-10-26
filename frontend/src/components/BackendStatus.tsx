import { RefreshCw } from 'lucide-react'
import { useBackendHealth } from '../hooks/useBackendHealth'

export function BackendStatus() {
  const { status, retry } = useBackendHealth()
  return <div className="connection">
    <span role="status" className={`status ${status}`}>
      <span className="status-dot" />
      {status === 'connected' ? 'Backend connected' : status === 'checking' ? 'Checking backend…' : 'Backend offline'}
    </span>
    <button className="icon-button" onClick={retry} disabled={status === 'checking'} aria-label="Retry backend connection" title="Retry connection"><RefreshCw size={15} /></button>
  </div>
}
