import { useEffect, useState } from 'react'
import { getHealth } from '../services/api'

export function useBackendHealth() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'offline'>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    let active = true
    getHealth(controller.signal)
      .then(() => { if (active) setStatus('connected') })
      .catch(() => { if (active) setStatus('offline') })
      .finally(() => window.clearTimeout(timeout))
    return () => { active = false; window.clearTimeout(timeout); controller.abort() }
  }, [attempt])
  return { status, retry: () => { setStatus('checking'); setAttempt(value => value + 1) } }
}
