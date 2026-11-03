import { useEffect, useState } from 'react'
import { BACKEND_CONNECT_TIMEOUT_MS, getHealth } from '../services/api'

export function useBackendHealth() {
  const [status, setStatus] = useState<'checking' | 'waking' | 'connected' | 'offline'>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), BACKEND_CONNECT_TIMEOUT_MS)
    const waking = window.setTimeout(() => { if (active) setStatus('waking') }, 5000)
    getHealth(controller.signal)
      .then(() => { if (active) setStatus('connected') })
      .catch(() => { if (active) setStatus('offline') })
      .finally(() => { window.clearTimeout(timeout); window.clearTimeout(waking) })
    return () => { active = false; window.clearTimeout(timeout); window.clearTimeout(waking); controller.abort() }
  }, [attempt])
  return { status, retry: () => { setStatus('checking'); setAttempt(value => value + 1) } }
}
