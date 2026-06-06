'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistResult, ClusterSearchHit } from '@shared/cluster'
import { clusterApi } from '@/lib/cluster-api'

/** Mobile cluster — embedded in central feed + works standalone. Electron uses separate droplet window. */
export function MobileClusterDock() {
  const [open, setOpen] = useState(false)
  const [electron, setElectron] = useState(false)
  const [query, setQuery] = useState('')
  const [assist, setAssist] = useState<AssistResult | null>(null)
  const [hits, setHits] = useState<ClusterSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setElectron(!!window.notch)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      void clusterApi.search(query).then(setHits).catch(() => setHits([]))
    }, 80)
    return () => clearTimeout(t)
  }, [query, open])

  const openDroplet = useCallback(() => {
    if (window.notch?.expand) {
      window.notch.expand()
      return
    }
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 60)
  }, [])

  const closeDroplet = useCallback(() => {
    if (window.notch?.collapse) {
      window.notch.collapse()
      return
    }
    setOpen(false)
    setAssist(null)
    setQuery('')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        if (open || document.querySelector('.mobile-dock-open')) closeDroplet()
        else openDroplet()
      }
      if (e.key === 'Escape') closeDroplet()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openDroplet, closeDroplet])

  const runAssist = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      setAssist(await clusterApi.assist(query))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mobile-dock-wrap">
      {!open && (
        <button type="button" className="mobile-dock-dot" onClick={openDroplet} title="Mobile cluster · ⌘⇧Space">
          <span className="mobile-dock-dot-inner" />
          {live && <span className="mobile-dock-live">LIVE</span>}
        </button>
      )}

      {open && (
        <div className={`mobile-dock-panel ${open ? 'mobile-dock-open' : ''}`}>
          <div className="mobile-dock-header">
            <div className="flex items-center gap-2">
              <span className="mobile-dock-pulse" />
              <span className="text-xs font-bold text-white">Mobile cluster</span>
              <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-400">
                AMBIENT
              </span>
            </div>
            <button type="button" onClick={closeDroplet} className="text-white/40 hover:text-white">
              ✕
            </button>
          </div>
          <p className="px-3 pb-2 text-[10px] text-white/40">
            {electron
              ? 'Also floating below your Mac notch · same context'
              : 'Transcribing Meet in real-time · faster than native captions'}
          </p>
          <div className="px-3 pb-3">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runAssist()}
              placeholder="Wtf do I say to their GDPR question?"
              className="mobile-dock-input"
            />
            <button type="button" className="mobile-dock-btn" disabled={loading || !query.trim()} onClick={() => void runAssist()}>
              {loading ? 'Greping graph…' : 'Get guidance →'}
            </button>
            {assist && (
              <div className="mobile-dock-answer">
                <p className="text-[9px] font-bold uppercase tracking-wider text-sky-400">Say this</p>
                <p className="mt-2 text-[13px] leading-snug text-white/90">{assist.sayThis}</p>
              </div>
            )}
            {!assist && hits.length > 0 && (
              <div className="mt-2 space-y-1">
                {hits.slice(0, 3).map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                    onClick={() => {
                      setQuery(h.title)
                      void runAssist()
                    }}
                  >
                    <p className="text-[11px] text-white/80">{h.title}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
