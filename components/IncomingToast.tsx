'use client'

import { useEffect } from 'react'
import type { StreamItem } from '@shared/types'
import { SOURCE_COLORS } from '@shared/types'
import { useStreamStore } from '@/store/streamStore'
import { SourceBadge } from './SourceBadge'

export function IncomingToast() {
  const latestToast = useStreamStore((s) => s.latestToast)
  const setLatestToast = useStreamStore((s) => s.setLatestToast)
  const setExpandedId = useStreamStore((s) => s.setExpandedId)

  useEffect(() => {
    if (!latestToast) return
    const t = setTimeout(() => setLatestToast(null), 4200)
    return () => clearTimeout(t)
  }, [latestToast, setLatestToast])

  if (!latestToast) return null

  const accent = SOURCE_COLORS[latestToast.source]

  return (
    <button
      type="button"
      onClick={() => {
        setExpandedId(latestToast.id)
        setLatestToast(null)
      }}
      className="toast-enter pointer-events-auto absolute left-3 right-3 top-2 z-30 mx-auto max-w-lg rounded-lg border border-stream-border bg-stream-surface/95 p-3 text-left shadow-2xl backdrop-blur-md"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2">
        <SourceBadge source={latestToast.source} />
        <span className="font-mono text-[10px] text-stream-secondary">just now</span>
      </div>
      <p className="mt-1 font-sans text-sm font-medium text-stream-primary">
        {latestToast.sender.name}
      </p>
      <p className="mt-0.5 line-clamp-2 font-sans text-xs text-stream-secondary">
        {latestToast.title ? `${latestToast.title} — ` : ''}
        {latestToast.body}
      </p>
    </button>
  )
}
