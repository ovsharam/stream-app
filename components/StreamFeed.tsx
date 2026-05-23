'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useStreamStore } from '@/store/streamStore'
import { StreamItemCard } from './StreamItemCard'
import { IncomingToast } from './IncomingToast'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { INTERACTIVE_DEMO } from '@/hooks/useInteractiveDemo'

export function StreamFeed() {
  const isLoading = useStreamStore((s) => s.isLoading)
  const newItemCount = useStreamStore((s) => s.newItemCount)
  const arrivedIds = useStreamStore((s) => s.arrivedIds)
  const clearNewItems = useStreamStore((s) => s.clearNewItems)
  const expandedId = useStreamStore((s) => s.expandedId)
  const setExpandedId = useStreamStore((s) => s.setExpandedId)
  const getFilteredItems = useStreamStore((s) => s.getFilteredItems)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  const items = getFilteredItems()
  const displayCount = Math.min(items.length, 100)

  const onLoadMore = useCallback(() => {}, [])
  const { sentinelRef } = useInfiniteScroll(onLoadMore, false)

  useEffect(() => {
    if (INTERACTIVE_DEMO && items.length > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevCountRef.current = items.length
  }, [items.length])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-stream-secondary">Loading stream…</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <IncomingToast />

      {newItemCount > 0 && (
        <button
          type="button"
          onClick={() => {
            clearNewItems()
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="absolute left-1/2 top-12 z-20 -translate-x-1/2 rounded-full border border-stream-perplexity/40 bg-stream-surface px-3 py-1 font-mono text-xs text-stream-perplexity shadow-lg shadow-stream-perplexity/10 animate-pulse"
        >
          ↑ {newItemCount} new
        </button>
      )}

      <div
        ref={scrollRef}
        className="feed-scroll flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))]"
      >
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="font-mono text-sm text-stream-secondary">
              Waiting for signal…
            </p>
          </div>
        ) : (
          <>
            {items.slice(0, displayCount).map((item) => (
              <StreamItemCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                isArrived={arrivedIds.includes(item.id)}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              />
            ))}
            <div ref={sentinelRef} className="h-4" />
          </>
        )}
      </div>
    </div>
  )
}
