import { useEffect, useState } from 'react'
import { getHealth } from '../services/api'

// Only this read-only readiness check retries. It never replays customer requests.
export const BACKEND_CONNECTION_BUDGET_MS = 90_000
const WARMING_AFTER_MS = 5_000
const RETRY_DELAY_MS = 3_000
type ConnectionStatus = 'checking' | 'warming' | 'connected' | 'timeout' | 'paused'

export function useBackendHealth() {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [attempt, setAttempt] = useState<number | null>(0)
  useEffect(() => {
    if (attempt === null) return
    const controller = new AbortController()
    let stopped = false
    let retryTimer: number | undefined
    const warmingTimer = window.setTimeout(() => setStatus('warming'), WARMING_AFTER_MS)
    const deadline = window.setTimeout(() => {
      setStatus('timeout')
      stop()
    }, BACKEND_CONNECTION_BUDGET_MS)
    function stop() {
      stopped = true
      window.clearTimeout(warmingTimer)
      window.clearTimeout(deadline)
      window.clearTimeout(retryTimer)
      controller.abort()
    }
    async function check() {
      try {
        // Explicit signal gives this check its own bounded startup budget.
        await getHealth(controller.signal)
        if (stopped) return
        setStatus('connected')
        stop()
      } catch {
        if (!stopped) retryTimer = window.setTimeout(() => void check(), RETRY_DELAY_MS)
      }
    }
    void check()
    return stop
  }, [attempt])
  return {
    status,
    retry: () => { setStatus('checking'); setAttempt(value => (value ?? -1) + 1) },
    cancel: () => { setAttempt(null); setStatus('paused') },
  }
}
