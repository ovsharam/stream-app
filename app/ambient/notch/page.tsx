'use client'

import { useEffect, useState } from 'react'
import type { Signal } from '@shared/graph'
import type { FdeScoreResult } from '@shared/scoring'
import { SIGNAL_COLORS } from '@shared/graph'
import { graphApi } from '@/lib/graph-api'

export default function NotchBar() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [caseName, setCaseName] = useState('')
  const [betLabel, setBetLabel] = useState('')

  useEffect(() => {
    const load = () => {
      void graphApi.context().then(async (ctx) => {
        setCaseName(ctx.activeCase?.company ?? '')
        setSignals(ctx.recentSignals.slice(0, 4))
        if (ctx.activeCase) {
          const s: FdeScoreResult = await graphApi.score(ctx.activeCase.id)
          setBetLabel(s.betSize === 'quick_win' ? 'QW' : s.betSize === 'big_bet' ? 'BB' : '?')
        }
      })
    }
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="notch-bar flex h-full w-full items-center gap-2 rounded-full px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="shrink-0 font-mono text-[10px] font-medium tracking-wide text-white/50">
        {caseName || 'STREAM'}
      </span>
      {betLabel && (
        <span className="shrink-0 rounded bg-white/10 px-1 font-mono text-[9px] text-teal-400">
          {betLabel}
        </span>
      )}
      <span className="h-3 w-px shrink-0 bg-white/15" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {signals.map((s, i) => (
          <span
            key={s.id}
            className="notch-token shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={{
              animationDelay: `${i * 0.08}s`,
              color: SIGNAL_COLORS[s.type],
              backgroundColor: `${SIGNAL_COLORS[s.type]}18`,
              border: `1px solid ${SIGNAL_COLORS[s.type]}33`
            }}
          >
            {s.token}
          </span>
        ))}
      </div>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
    </div>
  )
}
