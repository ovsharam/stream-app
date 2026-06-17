import type { FdeEngagement, EngagementStage, ScopeBucket } from '@shared/fde-engagement'
import { useEngagements } from './useEngagements'

const STAGE_LABEL: Record<EngagementStage, string> = {
  intake: 'Intake',
  build: 'Build',
  maintenance: 'Maintenance',
  paused: 'Paused'
}

const SCOPE_LABEL: Record<ScopeBucket, string> = {
  quick_win: 'Quick win',
  big_bet: 'Big bet',
  unknown: 'Scope TBD'
}

type Props = {
  onOpenMeeting?: (feedItemId: string) => void
  onSelect?: (engagement: FdeEngagement) => void
  compact?: boolean
}

export function EngagementsPanel({ onOpenMeeting, onSelect, compact }: Props) {
  const { engagements, refreshing, pendingIds, patch } = useEngagements()

  if (engagements.length === 0 && refreshing) {
    return <p className="x-portal-empty x-eng-loading">Loading clients…</p>
  }

  if (engagements.length === 0) {
    return (
      <div className="x-eng-empty">
        <p className="x-portal-empty">No client engagements yet.</p>
        <p className="x-eng-empty-hint">
          Connect Gmail in Apps, take a call with ⌘⇧L, end with ⌘⇧K — intake auto-creates from post-call extraction.
        </p>
      </div>
    )
  }

  const list = compact ? engagements.slice(0, 4) : engagements

  return (
    <ul className={`x-eng-list ${refreshing ? 'x-eng-list-refreshing' : ''}`}>
      {list.map((e) => (
        <li
          key={e.id}
          className={`x-eng-card ${e.escalationLevel > 0 ? 'x-eng-card-alert' : ''} ${pendingIds.has(e.id) ? 'x-eng-card-pending' : ''}`}
        >
          <button
            type="button"
            className="x-eng-card-main"
            onClick={() => {
              const feedId = e.feedItemIds[e.feedItemIds.length - 1]?.replace(/^ext-/, '')
              if (compact && feedId && onOpenMeeting) {
                onOpenMeeting(feedId)
                return
              }
              onSelect?.(e)
            }}
          >
            <div className="x-eng-card-head">
              <strong>{e.clientName}</strong>
              <span className={`x-eng-scope x-eng-scope-${e.scope}`}>{SCOPE_LABEL[e.scope]}</span>
            </div>
            <p className="x-eng-card-meta">
              {STAGE_LABEL[e.stage]}
              {e.company ? ` · ${e.company}` : ''}
              {e.escalationLevel > 0 ? ` · ⚠ ${e.escalationLevel === 2 ? 'Escalated' : 'Attention'}` : ''}
            </p>
            {e.summary && !compact ? (
              <p className="x-eng-card-summary">{e.summary.slice(0, 140)}{e.summary.length > 140 ? '…' : ''}</p>
            ) : null}
          </button>
          {!compact ? (
            <div className="x-eng-card-actions">
              {e.feedItemIds[0] && onOpenMeeting ? (
                <button
                  type="button"
                  className="x-eng-action"
                  onClick={() => onOpenMeeting(e.feedItemIds[e.feedItemIds.length - 1]!.replace(/^ext-/, ''))}
                >
                  Review call
                </button>
              ) : null}
              {e.stage === 'intake' && e.scope !== 'unknown' ? (
                <button
                  type="button"
                  className="x-eng-action"
                  onClick={() => void patch(e.id, { stage: 'build', scopeApproved: true } as Partial<FdeEngagement> & { scopeApproved?: boolean })}
                >
                  Start build
                </button>
              ) : null}
              {e.stage === 'build' ? (
                <button type="button" className="x-eng-action" onClick={() => void patch(e.id, { stage: 'maintenance' })}>
                  → Maintenance
                </button>
              ) : null}
              <button
                type="button"
                className="x-eng-action x-eng-action-muted"
                onClick={() =>
                  void patch(e.id, {
                    escalationLevel: ((e.escalationLevel + 1) % 3) as 0 | 1 | 2
                  })
                }
              >
                Escalate
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
