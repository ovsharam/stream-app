import { useStreamStore } from '@/store/streamStore'
import { INTERACTIVE_DEMO } from '@/hooks/useInteractiveDemo'

export function AppHeader() {
  const keywordFilter = useStreamStore((s) => s.keywordFilter)
  const setKeywordFilter = useStreamStore((s) => s.setKeywordFilter)
  const unread = useStreamStore((s) => s.getUnreadCount())

  return (
    <header className="drag-region flex h-header shrink-0 items-center gap-3 border-b border-stream-border px-4">
      <span className="font-mono text-sm font-medium tracking-widest text-stream-primary">
        STREAM
      </span>
      {INTERACTIVE_DEMO && (
        <span className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-red-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          Live
        </span>
      )}
      {unread > 0 && (
        <span className="rounded-full bg-stream-gmail/20 px-2 py-0.5 font-mono text-[10px] text-stream-gmail">
          {unread} unread
        </span>
      )}
      <div className="ml-auto flex items-center gap-2 no-drag">
        <input
          type="search"
          value={keywordFilter}
          onChange={(e) => setKeywordFilter(e.target.value)}
          placeholder="Filter…"
          className="w-48 rounded border border-stream-border bg-stream-bg px-2 py-1 font-mono text-xs text-stream-primary placeholder:text-stream-secondary outline-none"
        />
      </div>
    </header>
  )
}
