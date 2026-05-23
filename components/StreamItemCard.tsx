'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { StreamItem } from '@shared/types'
import { SOURCE_COLORS } from '@shared/types'
import { SourceBadge } from './SourceBadge'
import { formatBody } from '@/lib/sanitize'
import { api } from '@/lib/api'
import { isDemoLiveId } from '@/lib/demo-scenarios'
import { useStreamStore } from '@/store/streamStore'

interface Props {
  item: StreamItem
  expanded: boolean
  isArrived?: boolean
  onToggle: () => void
}

function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function StreamItemCard({ item, expanded, isArrived, onToggle }: Props) {
  const updateItem = useStreamStore((s) => s.updateItem)
  const clearArrivedId = useStreamStore((s) => s.clearArrivedId)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const accent = SOURCE_COLORS[item.source]

  useEffect(() => {
    if (!isArrived) return
    const t = setTimeout(() => clearArrivedId(item.id), 2400)
    return () => clearTimeout(t)
  }, [isArrived, item.id, clearArrivedId])

  const markRead = useCallback(async () => {
    if (!item.isUnread) return
    if (isDemoLiveId(item.id)) {
      updateItem({ ...item, isUnread: false })
      return
    }
    const updated = await api.updateItem(item.id, { isUnread: false })
    updateItem(updated)
  }, [item, updateItem])

  const toggleStar = useCallback(async () => {
    if (isDemoLiveId(item.id)) {
      updateItem({ ...item, isStarred: !item.isStarred })
      return
    }
    const updated = await api.updateItem(item.id, { isStarred: !item.isStarred })
    updateItem(updated)
  }, [item, updateItem])

  const onPointerDown = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!touchStart.current) return
    const dx = e.clientX - touchStart.current.x
    const dy = Math.abs(e.clientY - touchStart.current.y)
    if (dy > 40) return
    if (dx > 60) void markRead()
    if (dx < -60) void toggleStar()
    touchStart.current = null
  }

  return (
    <article
      className={`group cursor-pointer border-b border-stream-border px-4 py-3 transition-colors hover:bg-stream-surface/60 ${
        isArrived ? 'item-arrive' : ''
      }`}
      style={{
        borderLeft: `2px solid ${item.isUnread ? accent : 'transparent'}`
      }}
      onClick={onToggle}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stream-border font-mono text-xs ${
            isArrived ? 'avatar-pop' : ''
          }`}
          style={{ color: accent }}
        >
          {item.sender.avatarUrl ? (
            <img src={item.sender.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            item.sender.name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-sm font-medium text-stream-primary">
              {item.sender.name}
            </span>
            {item.sender.handle && (
              <span className="font-mono text-xs text-stream-secondary">{item.sender.handle}</span>
            )}
            <SourceBadge source={item.source} />
            <span className="ml-auto font-mono text-[10px] text-stream-secondary">
              {formatTime(item.timestamp)}
            </span>
            {item.isStarred && <span className="text-stream-note">★</span>}
            {isArrived && item.isUnread && (
              <span className="rounded bg-stream-perplexity/20 px-1 font-mono text-[9px] text-stream-perplexity">
                NEW
              </span>
            )}
          </div>

          {item.title && (
            <p className="mt-0.5 font-sans text-sm font-medium text-stream-primary/90">{item.title}</p>
          )}

          <div
            className={`mt-1 font-sans text-sm leading-relaxed text-stream-primary/80 ${expanded ? '' : 'line-clamp-3'}`}
            dangerouslySetInnerHTML={{
              __html: formatBody(expanded ? (item.bodyFull ?? item.body) : item.body)
            }}
          />

          {expanded && item.attachments && item.attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {item.attachments.map((a, i) => (
                <li key={i}>
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-stream-perplexity hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {a.name}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-stream-secondary">{a.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {item.reactions && item.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.reactions.map((r) => (
                <span
                  key={r.emoji}
                  className="rounded bg-stream-border px-1.5 py-0.5 font-mono text-[10px]"
                >
                  {r.emoji} {r.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
