import { useEffect, useState } from 'react'
import type { FdeEngagement, EngagementStage, ScopeBucket } from '@shared/fde-engagement'
import { clusterApi } from '../lib/api'

const CACHE_KEY = 'stream.central.engagements'

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

function readCachedEngagements(): FdeEngagement[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as FdeEngagement[]) : []
  } catch {
    return []
  }
}

function writeCachedEngagements(list: FdeEngagement[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list))
  } catch {
    /* ignore quota */
  }
}

type Props = {
  onOpenMeeting?: (feedItemId: string) => void
  onSelect?: (engagement: FdeEngagement) => void
  compact?: boolean
}

export function EngagementsPanel({ onOpenMeeting, onSelect, compact }: Props) {
  const [engagements, setEngagements] = useState<FdeEngagement[]>(() => readCachedEngagements())
  const [refreshing, setRefreshing] = useState(false)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true)
    try {
      const data = await clusterApi.engagements()
      setEngagements(data.engagements)
      writeCachedEngagements(data.engagements)
    } catch {
      /* keep stale cache on error */
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load({ silent: engagements.length > 0 })
    const onRefresh = () => void load({ silent: true })
    window.addEventListener('notch:engagements-updated', onRefresh)
    window.addEventListener('notch:stream-push', onRefresh)
    window.addEventListener('stream:user-role', onRefresh)
    return () => {
      window.removeEventListener('notch:engagements-updated', onRefresh)
      window.removeEventListener('notch:stream-push', onRefresh)
      window.removeEventListener('stream:user-role', onRefresh)
    }
  }, [])

  const patch = async (id: string, patchFields: Partial<FdeEngagement>) => {
    const prev = engagements.find((e) => e.id === id)
    if (!prev) return

    const optimistic = { ...prev, ...patchFields }
    setEngagements((list) => list.map((e) => (e.id === id ? optimistic : e)))
    setPendingIds((s) => new Set(s).add(id))

    try {
      const { engagement } = await clusterApi.patchEngagement(id, patchFields)
      setEngagements((list) => {
        const next = list.map((e) => (e.id === id ? engagement : e))
        writeCachedEngagements(next)
        return next
      })
      window.dispatchEvent(new Event('notch:engagements-updated'))
    } catch {
      setEngagements((list) => list.map((e) => (e.id === id ? prev : e)))
    } finally {
      setPendingIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

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
