'use client'

import { useEffect, useRef } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { StreamEventCard } from './StreamEventCard'

type Props = {
  events: CentralStreamEvent[]
  live: boolean
}

export function CentralStream({ events, live }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(events.length)

  useEffect(() => {
    if (events.length > prevCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    prevCount.current = events.length
  }, [events.length])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-[540px] space-y-3">
        <div className="mb-8 text-center">
          <p className="text-[13px] font-medium text-neutral-400">Today</p>
          <p className="mt-1 text-[12px] text-neutral-400">
            Acme Corp · streaming from Notch, Meet, Gmail, Slack, Gong
          </p>
        </div>

        {events.map((e, i) => (
          <StreamEventCard
            key={e.id}
            source={e.source}
            title={e.title}
            body={e.body}
            ts={e.ts}
            highlight={e.highlight}
            promptPreview={e.promptPreview}
            isNew={i === events.length - 1 && live}
          />
        ))}

        {live && (
          <div className="flex items-center justify-center gap-2 py-4">
            <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[12px] text-neutral-400">Streaming live</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
