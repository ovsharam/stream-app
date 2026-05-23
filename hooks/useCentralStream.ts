'use client'

import { useEffect, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { STREAM_REPLAY, STREAM_SEED } from '@/lib/central-stream-demo'

const REPLAY_MS = 2800

export function useCentralStream() {
  const [events, setEvents] = useState<CentralStreamEvent[]>([])
  const [live, setLive] = useState(false)
  const replayIdx = useRef(0)
  const booted = useRef(false)

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    setEvents([...STREAM_SEED].sort((a, b) => b.ts - a.ts))
    setLive(true)

    const interval = setInterval(() => {
      const next = STREAM_REPLAY[replayIdx.current]
      if (!next) {
        setLive(false)
        clearInterval(interval)
        return
      }
      const event: CentralStreamEvent = {
        ...next,
        id: `live-${replayIdx.current}-${Date.now()}`,
        ts: Date.now()
      }
      replayIdx.current += 1
      setEvents((prev) => [event, ...prev])
    }, REPLAY_MS)

    return () => clearInterval(interval)
  }, [])

  return { events, live }
}
