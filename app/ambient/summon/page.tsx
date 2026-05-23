'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActiveContext, GraphSearchResult } from '@shared/graph'
import type { FdeScoreResult, BrowserContext } from '@shared/scoring'
import { SIGNAL_COLORS, SIGNAL_LABELS } from '@shared/graph'
import { graphApi } from '@/lib/graph-api'
import { FdeScoreCard } from '@/components/FdeScoreCard'

export default function SummonPanel() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [ctx, setCtx] = useState<ActiveContext | null>(null)
  const [results, setResults] = useState<GraphSearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const [fdeScore, setFdeScore] = useState<FdeScoreResult | null>(null)
  const [browserCtx, setBrowserCtx] = useState<BrowserContext | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadContext = useCallback(async () => {
    const [c, bc, conn] = await Promise.all([
      graphApi.context(),
      graphApi.browserContext().catch(() => null),
      graphApi.connections().catch(() => ({ connected: {} as Record<string, boolean> }))
    ])
    setCtx(c)
    setBrowserCtx(bc)
    setGmailConnected(!!conn.connected.gmail)
    if (c.activeCase) {
      const s = await graphApi.score(c.activeCase.id)
      setFdeScore(s)
    }
  }, [])

  useEffect(() => {
    void loadContext()
    void graphApi.search('').then(setResults)
    inputRef.current?.focus()
  }, [loadContext])

  useEffect(() => {
    const t = setTimeout(() => {
      void graphApi.search(query).then((r) => {
        setResults(r)
        setSelected(0)
      })
    }, 80)
    return () => clearTimeout(t)
  }, [query])

  const showScore =
    fdeScore &&
    (!query ||
      /score|quick|big bet|fde|pilot/i.test(query) ||
      results.some((r) => r.id === 'action-fde-score'))

  const handleGmailSync = async () => {
    if (!gmailConnected) {
      const { url } = await graphApi.gmailAuthUrl()
      window.open(url, '_blank', 'noopener,noreferrer')
      setStatus('Complete Gmail OAuth in browser, then sync again')
      return
    }
    setSyncing(true)
    setStatus(null)
    try {
      const res = await graphApi.syncGmail()
      setStatus(`Gmail: ${res.items} threads → ${res.signals} signals`)
      await loadContext()
    } catch (e) {
      setStatus(String(e))
    } finally {
      setSyncing(false)
    }
  }

  const activateResult = useCallback(
    async (r: GraphSearchResult) => {
      if (r.id === 'action-fde-score' && ctx?.activeCase) {
        const s = await graphApi.score(ctx.activeCase.id)
        setFdeScore(s)
        setQuery('score')
        return
      }
      if (r.kind === 'pattern') {
        setQuery(r.title)
        return
      }
      if (r.kind === 'signal') {
        setQuery(r.title)
      }
    },
    [ctx?.activeCase]
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter' && results[selected]) {
        e.preventDefault()
        void activateResult(results[selected])
      } else if (e.key === 'Escape') {
        window.close?.()
      } else if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        setQuery('gdpr brief')
      }
    },
    [results, selected, activateResult]
  )

  return (
    <div className="summon-root flex min-h-screen items-start justify-center p-6 pt-[10vh]">
      <div
        className={`summon-panel w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 ${
          focused ? 'summon-panel-focus' : ''
        }`}
      >
        <div className="relative px-4 py-3">
          {focused && (
            <>
              <span className="ripple-ring ripple-1" />
              <span className="ripple-ring ripple-2" />
            </>
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            placeholder="Search cases, signals, score…"
            className="relative z-10 w-full bg-transparent font-sans text-base text-white/95 placeholder:text-white/35 outline-none"
            spellCheck={false}
          />
        </div>

        {ctx && (
          <div className="border-t border-white/8 px-4 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] uppercase tracking-widest text-white/40">
                {ctx.activeCase ? ctx.activeCase.name : 'No active case'} · graph scope
              </p>
              {browserCtx && (
                <span className="truncate font-mono text-[9px] text-teal-400/80">
                  🌐 {browserCtx.hostname}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ctx.scope.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setQuery(chip)}
                  className="rounded-full border border-white/12 bg-white/6 px-2.5 py-0.5 font-mono text-[10px] text-white/75 hover:bg-white/12"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {showScore && fdeScore && ctx?.activeCase && (
          <FdeScoreCard score={fdeScore} caseName={ctx.activeCase.company} />
        )}

        {ctx?.patterns[0] && !query && !showScore && (
          <div className="mx-3 mb-2 rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2">
            <p className="font-mono text-[10px] text-blue-300/90">
              Pattern · {ctx.patterns[0].token} in {ctx.patterns[0].caseCount} deals
            </p>
            <p className="mt-0.5 font-sans text-xs text-white/70">{ctx.patterns[0].resolution}</p>
          </div>
        )}

        <ul className="max-h-[280px] overflow-y-auto border-t border-white/8 py-1">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => void activateResult(r)}
              className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${
                i === selected ? 'bg-white/10' : 'hover:bg-white/5'
              }`}
            >
              {r.signalType && (
                <span
                  className="mt-0.5 shrink-0 rounded px-1 py-0.5 font-mono text-[9px] uppercase"
                  style={{
                    color: SIGNAL_COLORS[r.signalType],
                    backgroundColor: `${SIGNAL_COLORS[r.signalType]}22`
                  }}
                >
                  {SIGNAL_LABELS[r.signalType]}
                </span>
              )}
              {r.kind === 'case' && (
                <span className="mt-0.5 font-mono text-[9px] uppercase text-white/40">Case</span>
              )}
              {r.kind === 'pattern' && (
                <span className="mt-0.5 font-mono text-[9px] uppercase text-blue-400">Pattern</span>
              )}
              {r.kind === 'action' && (
                <span className="mt-0.5 font-mono text-[9px] uppercase text-teal-400">Act</span>
              )}
              <div className="min-w-0">
                <p className="font-sans text-sm text-white/90">{r.title}</p>
                <p className="truncate font-mono text-[11px] text-white/45">{r.subtitle}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-2">
          <button
            type="button"
            onClick={() => void handleGmailSync()}
            disabled={syncing}
            className="rounded border border-white/12 px-2 py-1 font-mono text-[10px] text-white/70 hover:bg-white/8 disabled:opacity-50"
          >
            {syncing ? 'Syncing…' : gmailConnected ? '↻ Gmail → graph' : 'Connect Gmail'}
          </button>
          <button
            type="button"
            onClick={() => setQuery('score')}
            className="rounded border border-white/12 px-2 py-1 font-mono text-[10px] text-white/70 hover:bg-white/8"
          >
            FDE score
          </button>
          <span className="ml-auto font-mono text-[10px] text-white/30">↵ open · ⌘K brief</span>
        </div>

        {status && (
          <p className="border-t border-white/8 px-4 py-2 font-mono text-[10px] text-teal-400/90">
            {status}
          </p>
        )}
      </div>
    </div>
  )
}
