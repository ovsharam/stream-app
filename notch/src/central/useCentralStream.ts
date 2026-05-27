import { useEffect, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { clusterApi, integrationApi } from '../lib/api'
import { getUserRole } from '../lib/user-role'

const POLL_MS = 2000
const AUTO_SYNC_MS = 5000

export function useCentralStream() {
  const [events, setEvents] = useState<CentralStreamEvent[]>([])
  const [live, setLive] = useState(false)
  const lastAutoSyncMs = useRef(0)

  useEffect(() => {
    const sync = async () => {
      const now = Date.now()
      if (now - lastAutoSyncMs.current >= AUTO_SYNC_MS) {
        lastAutoSyncMs.current = now
        void integrationApi.syncAll().catch(() => undefined)
      }
      const incoming = await clusterApi.stream(getUserRole())
      setEvents(incoming)
      setLive(
        incoming.some(
          (e) =>
            e.kind === 'transcript_live' ||
            e.kind === 'assist' ||
            (e.kind === 'insight' && e.title.toLowerCase().includes('load-bearing'))
        )
      )
    }

    void sync()
    const interval = setInterval(() => void sync(), POLL_MS)
    const onRole = () => void sync()
    window.addEventListener('stream:user-role', onRole)

    return () => {
      clearInterval(interval)
      window.removeEventListener('stream:user-role', onRole)
    }
  }, [])

  return { events, live }
}
