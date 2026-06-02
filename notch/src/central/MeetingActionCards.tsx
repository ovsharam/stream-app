import { useState, type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { MeetingActionApproval, MeetingActionProposal } from '@shared/meeting-actions'
import {
  getMeetingActionDetail,
  parseMeetingActionsMeta
} from '@shared/meeting-actions'
import { clusterApi } from '../lib/api'
import { IconMonday } from './Icons'

const PROVIDER_AVATAR: Record<
  MeetingActionProposal['provider'],
  { bg: string; label: string; useMondayIcon?: boolean }
> = {
  monday: { bg: '#ff3d57', label: 'M', useMondayIcon: true },
  cursor: { bg: '#111827', label: 'Cu' },
  github: { bg: '#24292f', label: 'GH' },
  calcom: { bg: '#111827', label: 'Cal' }
}

type Props = {
  event: CentralStreamEvent
  onRefresh?: () => void
  /** deck = Work post-call surface; feed = compact (hidden — use link in feed) */
  variant?: 'deck' | 'inline'
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function ProviderAvatar({ provider }: { provider: MeetingActionProposal['provider'] }) {
  const av = PROVIDER_AVATAR[provider]
  if (av.useMondayIcon) {
    return (
      <div className="x-meeting-action-icon x-meeting-action-icon-monday" aria-hidden>
        <IconMonday className="x-meeting-action-brand-icon" />
      </div>
    )
  }
  return (
    <div className="x-meeting-action-icon" style={{ background: av.bg }} aria-hidden>
      {av.label}
    </div>
  )
}

function ActionDetail({
  proposal,
  meta
}: {
  proposal: MeetingActionProposal
  meta?: Record<string, unknown>
}) {
  const detail = getMeetingActionDetail(proposal, meta)

  return (
    <div className="x-meeting-action-detail">
      <p className="x-meeting-action-detail-summary">{detail.summary}</p>

      {detail.bullets && detail.bullets.length > 0 ? (
        <div className="x-meeting-action-detail-block">
          <p className="x-meeting-action-detail-heading">Next steps included</p>
          <ul className="x-meeting-action-detail-list">
            {detail.bullets.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {detail.body ? (
        <div className="x-meeting-action-detail-block">
          <p className="x-meeting-action-detail-heading">
            {proposal.provider === 'cursor' ? 'Build brief' : 'Task details'}
          </p>
          <pre className="x-meeting-action-detail-body">{detail.body}</pre>
        </div>
      ) : null}

      <div className="x-meeting-action-detail-block">
        <p className="x-meeting-action-detail-heading">Command that will run</p>
        <code className="x-meeting-action-detail-command">
          <span className="x-meeting-action-detail-command-tag">{detail.commandLabel}</span>
          {detail.commandLabel.endsWith(':') ? ' ' : ': '}
          {detail.commandBody}
        </code>
      </div>
    </div>
  )
}

function ActionCard({
  proposal,
  approval,
  loading,
  routing,
  expanded,
  meta,
  onToggle,
  onApprove
}: {
  proposal: MeetingActionProposal
  approval?: MeetingActionApproval
  loading: boolean
  routing: boolean
  expanded: boolean
  meta?: Record<string, unknown>
  onToggle: (e: MouseEvent<HTMLButtonElement>) => void
  onApprove: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const succeeded = Boolean(approval?.ok)
  const failed = Boolean(approval && !approval.ok && !routing && !loading)
  const showRouting = routing || (loading && approval?.message === '✓ Routing…')

  return (
    <div
      className={`x-meeting-action-card ${expanded ? 'x-meeting-action-card-expanded' : ''} ${succeeded ? 'x-meeting-action-card-ok' : failed ? 'x-meeting-action-card-err' : showRouting ? 'x-eng-card-pending' : ''}`}
    >
      <ProviderAvatar provider={proposal.provider} />
      <div className="x-meeting-action-body">
        <p className="x-meeting-action-label">{proposal.label}</p>
        <p className="x-meeting-action-desc">{proposal.description}</p>
        {approval ? (
          <p
            className={`x-meeting-action-result ${approval.ok ? 'x-meeting-action-result-ok' : showRouting ? 'x-meeting-action-result-routing' : 'x-meeting-action-result-err'}`}
          >
            {approval.ok ? '✓ ' : showRouting ? '' : '✕ '}
            {approval.message}
          </p>
        ) : null}
        {expanded ? <ActionDetail proposal={proposal} meta={meta} /> : null}
      </div>
      <div className="x-meeting-action-actions">
        {!succeeded ? (
          <>
            <button
              type="button"
              className="x-meeting-action-review"
              aria-expanded={expanded}
              onClick={onToggle}
            >
              {expanded ? 'Hide' : failed ? 'Review' : 'Review'}
            </button>
            {expanded ? (
              <button
                type="button"
                className="x-action-btn x-action-btn-primary x-meeting-action-approve"
                disabled={loading}
                onClick={onApprove}
              >
                {loading ? 'Running…' : failed ? 'Retry' : 'Approve'}
              </button>
            ) : failed ? (
              <button
                type="button"
                className="x-action-btn x-action-btn-primary x-meeting-action-approve"
                disabled={loading}
                onClick={onApprove}
              >
                {loading ? 'Running…' : 'Retry'}
              </button>
            ) : null}
          </>
        ) : (
          <span className="x-meeting-action-check" aria-label="Approved">
            ✓
          </span>
        )}
      </div>
    </div>
  )
}

export function MeetingActionCards({ event, onRefresh, variant = 'inline' }: Props) {
  const meta = parseMeetingActionsMeta(event.meta)
  const [approving, setApproving] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localApproved, setLocalApproved] = useState<Record<string, MeetingActionApproval>>({})

  if (event.source !== 'meeting' || !meta || meta.proposedActions.length === 0) {
    return null
  }

  if (variant === 'inline') {
    return null
  }

  const approvedActions = { ...meta.approvedActions, ...localApproved }
  const itemId = streamItemId(event)

  const approve = async (actionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (approving || approvedActions[actionId]?.ok) return
    setApproving(actionId)
    setLocalApproved((prev) => ({
      ...prev,
      [actionId]: { at: Date.now(), ok: false, message: '✓ Routing…' }
    }))
    try {
      const result = await clusterApi.approveMeetingAction({ itemId, actionId })
      setLocalApproved((prev) => ({
        ...prev,
        [actionId]: { at: Date.now(), ok: result.ok, message: result.message }
      }))
      if (result.ok) setExpandedId(null)
      onRefresh?.()
    } catch (err) {
      setLocalApproved((prev) => ({
        ...prev,
        [actionId]: {
          at: Date.now(),
          ok: false,
          message: err instanceof Error ? err.message : 'Approval failed'
        }
      }))
    } finally {
      setApproving(null)
    }
  }

  const toggle = (actionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setExpandedId((current) => (current === actionId ? null : actionId))
  }

  return (
    <div className={`x-meeting-actions ${variant === 'deck' ? 'x-meeting-actions-deck' : ''}`} onClick={(e) => e.stopPropagation()}>
      {variant !== 'deck' ? (
        <p className="x-meeting-actions-heading">Proposed actions — review before approving</p>
      ) : null}
      {meta.proposedActions.map((proposal) => (
        <ActionCard
          key={proposal.id}
          proposal={proposal}
          approval={approvedActions[proposal.id]}
          loading={approving === proposal.id}
          routing={approvedActions[proposal.id]?.message === '✓ Routing…'}
          expanded={expandedId === proposal.id}
          meta={event.meta}
          onToggle={(e) => toggle(proposal.id, e)}
          onApprove={(e) => void approve(proposal.id, e)}
        />
      ))}
    </div>
  )
}
