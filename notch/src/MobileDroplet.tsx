import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistResult, ClusterSearchHit } from '@shared/cluster'
import { clusterApi } from './lib/api'

type Mode = 'idle' | 'expanded'

export default function MobileDroplet() {
  const [mode, setMode] = useState<Mode>('idle')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ClusterSearchHit[]>([])
  const [assist, setAssist] = useState<AssistResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const expand = useCallback(() => {
    window.notch?.expand?.()
    setMode('expanded')
    setTimeout(() => inputRef.current?.focus(), 120)
  }, [])

  const collapse = useCallback(() => {
    window.notch?.collapse?.()
    setMode('idle')
    setQuery('')
    setAssist(null)
  }, [])

  useEffect(() => {
    return window.notch?.onMode?.((m: Mode) => {
      if (m === 'expanded') expand()
      else collapse()
    })
  }, [expand, collapse])

  useEffect(() => {
    if (mode !== 'expanded') return
    const t = setTimeout(() => {
      void clusterApi.search(query).then(setHits).catch(() => setHits([]))
    }, 100)
    return () => clearTimeout(t)
  }, [query, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapse])

  const runAssist = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const r = await clusterApi.assist(query)
      setAssist(r)
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'idle') {
    return (
      <div className="droplet-shell">
        <button
          type="button"
          className="droplet-idle"
          onClick={expand}
          title="Notch — ⌘⇧Space"
          aria-label="Open Notch assist"
        />
        <span className="droplet-live-label">LIVE</span>
      </div>
    )
  }

  return (
    <div className="droplet-panel">
      <div className="drag-region flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 live-pulse" />
          <span className="text-[10px] font-medium text-white/70">Notch</span>
        </div>
        <button type="button" onClick={collapse} className="no-drag text-white/30 hover:text-white/60">
          ✕
        </button>
      </div>

      <div className="no-drag p-3">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runAssist()}
          placeholder='Wtf do I say to their question?'
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-[#378ADD]/40"
        />
        <button
          type="button"
          onClick={() => void runAssist()}
          disabled={loading || !query.trim()}
          className="mt-2 w-full rounded-lg bg-[#378ADD]/25 py-2 text-xs font-medium text-[#85B7EB] disabled:opacity-40"
        >
          {loading ? 'Searching context…' : 'Get guidance'}
        </button>

        {assist && (
          <div className="live-answer-enter mt-3 space-y-3">
            <div className="rounded-lg border border-[#378ADD]/25 bg-[#378ADD]/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#85B7EB]/70">Say this</p>
              <p className="mt-2 text-xs leading-relaxed text-white/90">{assist.sayThis}</p>
            </div>
            {assist.agendaNext && (
              <div className="rounded-lg border border-[#EF9F27]/20 bg-[#BA7517]/5 px-3 py-2">
                <p className="text-[10px] text-[#EF9F27]">Next on agenda</p>
                <p className="mt-1 text-xs text-white/70">{assist.agendaNext}</p>
              </div>
            )}
            {assist.trustNote && (
              <p className="text-[10px] leading-relaxed text-white/40">{assist.trustNote}</p>
            )}
            <p className="font-mono text-[9px] text-white/20">{assist.sources.join(' · ')}</p>
          </div>
        )}

        {!assist && hits.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-white/25">Context</p>
            {hits.slice(0, 4).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  setQuery(h.title)
                  void runAssist()
                }}
                className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/5"
              >
                <p className="text-xs text-white/75">{h.title}</p>
                <p className="line-clamp-1 text-[10px] text-white/35">{h.snippet}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
