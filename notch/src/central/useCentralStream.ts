import { useEffect, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { STREAM_REPLAY, STREAM_SEED } from '../lib/stream-demo'

const REPLAY_MS = 2800

export function useCentralStream() {
  const [events, setEvents] = useState<CentralStreamEvent[]>([])
  const [live, setLive] = useState(false)
  const [transcriptLines, setTranscriptLines] = useState<{ speaker: string; text: string; ts: number }[]>([])
  const replayIdx = useRef(0)

  useEffect(() => {
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

      if (event.kind === 'transcript_live' && event.speaker && event.body) {
        setTranscriptLines((prev) => [
          { speaker: event.speaker, text: event.body, ts: event.ts },
          ...prev
        ].slice(0, 12))
      }
    }, REPLAY_MS)

    return () => clearInterval(interval)
  }, [])

  const meetActive = events.some(
    (e) => e.source === 'meet' && e.joinable && !events.some((x) => x.kind === 'transcript_done' && x.ts > e.ts)
  ) || live

  return { events, live, transcriptLines, meetActive }
}
