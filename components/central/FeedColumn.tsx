'use client'

import { useEffect, useRef } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { FeedPost } from './FeedPost'

type Tab = 'foryou' | 'live' | 'signals'

type Props = {
  events: CentralStreamEvent[]
  live: boolean
  tab: Tab
}

export function FeedColumn({ events, live, tab }: Props) {
  const topRef = useRef<HTMLDivElement>(null)
  const prevLen = useRef(events.length)

  const filtered =
    tab === 'live'
      ? events.filter((e) => e.kind === 'transcript_live' || e.kind === 'assist' || e.kind === 'transcript_done')
      : tab === 'signals'
        ? events.filter((e) => e.kind === 'signal' || e.kind === 'insight' || e.kind === 'build_prompt')
        : events

  useEffect(() => {
    if (events.length > prevLen.current) {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    prevLen.current = events.length
  }, [events.length])

  return (
    <div className="feed-column">
      {live && (
        <div className="feed-live-bar">
          <span className="feed-live-pulse" />
          <span>Live — Notch transcribing Acme Corp · Meet active</span>
        </div>
      )}

      <div ref={topRef} />

      {filtered.map((e, i) => (
        <FeedPost key={e.id} event={e} isNew={live && i === 0 && e.ts > Date.now() - 8000} />
      ))}

      {live && (
        <div className="feed-loading">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}
