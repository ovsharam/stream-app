'use client'

import type { FdeScoreResult } from '@shared/scoring'

const BET_LABELS = {
  quick_win: 'Quick win',
  big_bet: 'Big bet',
  unknown: 'Needs discovery'
}

const BET_COLORS = {
  quick_win: '#22C55E',
  big_bet: '#F59E0B',
  unknown: '#94A3B8'
}

export function FdeScoreCard({
  score,
  caseName,
  compact = false
}: {
  score: FdeScoreResult
  caseName?: string
  compact?: boolean
}) {
  const color = BET_COLORS[score.betSize]

  return (
    <div
      className={`rounded-xl border px-3 py-3 ${compact ? '' : 'mx-3 mb-2'}`}
      style={{ borderColor: `${color}44`, backgroundColor: `${color}11` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-white/45">
            FDE decision · {caseName ?? 'active case'}
          </p>
          <p className="mt-0.5 font-sans text-sm font-semibold" style={{ color }}>
            {BET_LABELS[score.betSize]}
            <span className="ml-2 font-mono text-[11px] font-normal text-white/50">
              {Math.round(score.confidence * 100)}% conf
            </span>
          </p>
        </div>
        {!compact && (
          <div className="text-right font-mono text-[10px] text-white/45">
            <div>QW {score.quickWinScore}</div>
            <div>BB {score.bigBetScore}</div>
          </div>
        )}
      </div>

      {!compact && score.rationale[0] && (
        <p className="mt-2 font-sans text-xs leading-relaxed text-white/70">{score.rationale[0]}</p>
      )}

      {score.recommendedQuickWin && (
        <div className="mt-2 rounded-lg border border-white/8 bg-black/20 px-2.5 py-2">
          <p className="font-mono text-[9px] uppercase text-teal-400/90">Quick-win action</p>
          <p className="mt-0.5 font-sans text-xs text-white/85">{score.recommendedQuickWin}</p>
        </div>
      )}

      {score.recommendedNextQuestion && !compact && (
        <p className="mt-2 font-mono text-[10px] text-white/40">
          Ask: {score.recommendedNextQuestion}
        </p>
      )}
    </div>
  )
}
