import { useCallback, useEffect, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { clusterApi, integrationApi } from '../lib/api'
import { connectStreamSocket } from '../lib/streamSocket'
import { getUserRole } from '../lib/user-role'

const AUTO_SYNC_MS = 5000
const POLL_LIVE_MS = 400
const POLL_RECENT_MS = 800
const POLL_IDLE_MS = 2500
const RECENT_WINDOW_MS = 30_000
const DEBOUNCE_MS = 50

const DEMO_UI =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { VITE_DEMO_MODE?: string } }).env?.VITE_DEMO_MODE === '1'

function isLiveEvent(e: CentralStreamEvent): boolean {
  return (
    e.kind === 'transcript_live' ||
    e.kind === 'assist' ||
    (e.kind === 'insight' && e.title.toLowerCase().includes('load-bearing'))
  )
}

function eventsEqual(a: CentralStreamEvent, b: CentralStreamEvent): boolean {
  return (
    a.id === b.id &&
    a.ts === b.ts &&
    a.kind === b.kind &&
    a.title === b.title &&
    a.body === b.body &&
    a.source === b.source
  )
}

function mergeEvents(
  prev: CentralStreamEvent[],
  incoming: CentralStreamEvent[]
): CentralStreamEvent[] {
  const prevById = new Map(prev.map((e) => [e.id, e]))
  return incoming.map((e) => {
    const old = prevById.get(e.id)
    return old && eventsEqual(old, e) ? old : e
  })
}

function pollIntervalMs(live: boolean, lastSyncMs: number): number {
  if (live) return POLL_LIVE_MS
  if (Date.now() - lastSyncMs < RECENT_WINDOW_MS) return POLL_RECENT_MS
  return POLL_IDLE_MS
}

export function useCentralStream() {
  const [events, setEvents] = useState<CentralStreamEvent[]>([])
  const [live, setLive] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const lastAutoSyncMs = useRef(0)
  const lastSyncMs = useRef(0)
  const liveRef = useRef(false)
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sync = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }
    inFlightRef.current = true

    if (!syncDelayRef.current) {
      syncDelayRef.current = setTimeout(() => setSyncing(true), 600)
    }

    try {
      const now = Date.now()
      if (!DEMO_UI && now - lastAutoSyncMs.current >= AUTO_SYNC_MS) {
        lastAutoSyncMs.current = now
        void integrationApi.syncAll().catch(() => undefined)
      }

      const incoming = await clusterApi.stream(getUserRole())
      lastSyncMs.current = Date.now()

      setEvents((prev) => mergeEvents(prev, incoming))
      const nextLive = incoming.some(isLiveEvent)
      liveRef.current = nextLive
      setLive(nextLive)
    } catch {
      /* keep stale data on error */
    } finally {
      inFlightRef.current = false
      if (syncDelayRef.current) {
        clearTimeout(syncDelayRef.current)
        syncDelayRef.current = null
      }
      setSyncing(false)
      if (pendingRef.current) {
        pendingRef.current = false
        void sync()
      }
    }
  }, [])

  const scheduleSync = useCallback(() => {
    if (debounceRef.current) return
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void sync()
    }, DEBOUNCE_MS)
  }, [sync])

  useEffect(() => {
    let mounted = true
    const disconnectSocket = connectStreamSocket()

    void sync()

    const schedulePollLoop = () => {
      if (!mounted) return
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      pollTimerRef.current = setTimeout(() => {
        if (!mounted) return
        void sync().finally(() => {
          if (mounted) schedulePollLoop()
        })
      }, pollIntervalMs(liveRef.current, lastSyncMs.current))
    }

    schedulePollLoop()

    const onPush = () => scheduleSync()
    const onRole = () => scheduleSync()

    window.addEventListener('notch:stream-push', onPush)
    window.addEventListener('stream:user-role', onRole)

    const onMeetingStarted = window.notch?.meeting?.onStarted?.(() => scheduleSync())
    const onMeetingEnded = window.notch?.meeting?.onEnded?.(() => scheduleSync())
    const onMeetingChunk = window.notch?.meeting?.onChunk?.(() => scheduleSync())
    const onMeetingSignal = window.notch?.meeting?.onSignal?.(() => scheduleSync())

    return () => {
      mounted = false
      disconnectSocket()
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      window.removeEventListener('notch:stream-push', onPush)
      window.removeEventListener('stream:user-role', onRole)
      onMeetingStarted?.()
      onMeetingEnded?.()
      onMeetingChunk?.()
      onMeetingSignal?.()
    }
  }, [sync, scheduleSync])

  return { events, live, syncing }
}
