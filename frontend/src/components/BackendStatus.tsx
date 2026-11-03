import { useBackendHealth } from '../hooks/useBackendHealth'
import './backend-status.css'

export function BackendStatus() {
  const { status, retry, cancel } = useBackendHealth()
  const connecting = status === 'checking' || status === 'warming'
  const labels = {
    checking: 'Connecting to backend…',
    warming: 'Waiting for backend to wake up…',
    connected: 'Backend connected',
    timeout: 'Backend connection timed out',
    paused: 'Connection check paused',
  }
  return <div className="connection backend-connection">
    <div role="status" aria-live="polite">
      <span className={`status ${status}`}>
        <span className="status-dot" aria-hidden="true" />
        {labels[status]}
      </span>
      {status !== 'connected' && <p className="connection-message">
        {connecting
          ? 'Checking automatically for up to 90 seconds. Your inputs stay saved in this session.'
          : status === 'timeout'
            ? 'No connection confirmed within 90 seconds. Your inputs are retained; retry when ready.'
            : 'Your inputs are retained. Retry when ready.'}
        {' '}Calculations and AI requests are never resent by this check.
      </p>}
    </div>
    <button className="secondary" type="button" onClick={connecting ? cancel : retry}>
      {connecting ? 'Stop connection check' : 'Retry backend connection'}
    </button>
  </div>
}
