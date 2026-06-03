import { useState, type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type {
  MeetingActionApproval,
  MeetingActionProposal,
  MeetingActionsMeta
} from '@shared/meeting-actions'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'

const EMPTY_MEETING_ACTIONS: MeetingActionsMeta = { proposedActions: [], approvedActions: {} }
import { clusterApi } from '../lib/api'
import { IconMonday } from './Icons'

const PROVIDER_LABEL: Record<MeetingActionProposal['provider'], string> = {
  monday: 'Monday',
  cursor: 'Cursor',
  github: 'GitHub',
  calcom: 'Cal.com'
}

type Props = {
  event: CentralStreamEvent
  onRefresh?: () => void
  variant?: 'deck' | 'inline' | 'simple'
  /** When parent renders Run all in the section header */
  hideRunAll?: boolean
  approvals?: MeetingActionApprovals
}

export type MeetingActionApprovals = {
  ready: boolean
  meta: MeetingActionsMeta
  approvedActions: Record<string, MeetingActionApproval>
  pending: MeetingActionProposal[]
  pendingCount: number
  showRunAll: boolean
  approving: string | null
  runAllBusy: boolean
  approve: (actionId: string, e: MouseEvent<HTMLButtonElement>) => Promise<void>
  runAll: () => Promise<void>
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function ProviderIcon({ provider }: { provider: MeetingActionProposal['provider'] }) {
  if (provider === 'monday') {
    return (
      <span className="x-meeting-action-icon x-meeting-action-icon-monday" aria-hidden>
        <IconMonday className="x-meeting-action-icon-glyph" />
      </span>
    )
  }
  return (
    <span className="x-meeting-action-icon" aria-hidden title={PROVIDER_LABEL[provider]}>
      {PROVIDER_LABEL[provider].slice(0, 1)}
    </span>
  )
}

function ProviderBadge({ provider }: { provider: MeetingActionProposal['provider'] }) {
  if (provider === 'monday') {
    return (
      <span className="x-meeting-action-badge x-meeting-action-badge-monday" aria-hidden>
        <IconMonday className="x-meeting-action-brand-icon" />
      </span>
    )
  }
  return <span className="x-meeting-action-badge">{PROVIDER_LABEL[provider].slice(0, 2)}</span>
}

function SimpleActionRow({
  proposal,
  approval,
  loading,
  onRun
}: {
  proposal: MeetingActionProposal
  approval?: MeetingActionApproval
  loading: boolean
  onRun: (e: MouseEvent<HTMLButtonElement>) => void
}) {
  const done = Boolean(approval?.ok)
  const failed = Boolean(approval && !approval.ok && !loading)

  return (
    <div
      className={`x-meeting-action-ios ${done ? 'x-meeting-action-ios-done' : failed ? 'x-meeting-action-ios-failed' : ''}`}
    >
      <ProviderIcon provider={proposal.provider} />
      <div className="x-meeting-action-ios-body">
        <p className="x-meeting-action-ios-label">{proposal.label}</p>
        {approval && !done && approval.message !== 'Routing…' ? (
          <p className="x-meeting-action-ios-msg">{approval.message}</p>
        ) : null}
      </div>
      {done ? (
        <span className="x-meeting-action-ios-status" aria-label="Done">
          Done
        </span>
      ) : (
        <button type="button" className="x-meeting-action-ios-run" disabled={loading} onClick={onRun}>
          {loading ? '…' : failed ? 'Retry' : 'Run'}
        </button>
      )}
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
      <ProviderBadge provider={proposal.provider} />
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
      </div>
      <div className="x-meeting-action-actions">
        {!succeeded ? (
          <button
            type="button"
            className="x-action-btn x-action-btn-primary x-meeting-action-approve"
            disabled={loading}
            onClick={onApprove}
          >
            {loading ? 'Running…' : failed ? 'Retry' : 'Run'}
          </button>
        ) : (
          <span className="x-meeting-action-check" aria-label="Approved">
            ✓
          </span>
        )}
      </div>
    </div>
  )
}

export function useMeetingActionApprovals(
  event: CentralStreamEvent,
  onRefresh?: () => void
): MeetingActionApprovals {
  const meta = parseMeetingActionsMeta(event.meta)
  const [approving, setApproving] = useState<string | null>(null)
  const [runAllBusy, setRunAllBusy] = useState(false)
  const [localApproved, setLocalApproved] = useState<Record<string, MeetingActionApproval>>({})

  const ready = event.source === 'meeting' && Boolean(meta && meta.proposedActions.length > 0)
  const safeMeta = meta ?? EMPTY_MEETING_ACTIONS
  const approvedActions = { ...safeMeta.approvedActions, ...localApproved }
  const itemId = streamItemId(event)
  const pending = safeMeta.proposedActions.filter((p) => !approvedActions[p.id]?.ok)
  const showRunAll = pending.length >= 2

  const approve = async (actionId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!ready || approving || approvedActions[actionId]?.ok) return
    setApproving(actionId)
    setLocalApproved((prev) => ({
      ...prev,
      [actionId]: { at: Date.now(), ok: false, message: 'Routing…' }
    }))
    try {
      const result = await clusterApi.approveMeetingAction({ itemId, actionId })
      setLocalApproved((prev) => ({
        ...prev,
        [actionId]: { at: Date.now(), ok: result.ok, message: result.message }
      }))
      onRefresh?.()
    } catch (err) {
      setLocalApproved((prev) => ({
        ...prev,
        [actionId]: {
          at: Date.now(),
          ok: false,
          message: err instanceof Error ? err.message : 'Failed'
        }
      }))
    } finally {
      setApproving(null)
    }
  }

  const runAll = async () => {
    if (!ready || runAllBusy || approving || pending.length === 0) return
    setRunAllBusy(true)
    for (const proposal of pending) {
      setApproving(proposal.id)
      setLocalApproved((prev) => ({
        ...prev,
        [proposal.id]: { at: Date.now(), ok: false, message: 'Routing…' }
      }))
      try {
        const result = await clusterApi.approveMeetingAction({ itemId, actionId: proposal.id })
        setLocalApproved((prev) => ({
          ...prev,
          [proposal.id]: { at: Date.now(), ok: result.ok, message: result.message }
        }))
      } catch (err) {
        setLocalApproved((prev) => ({
          ...prev,
          [proposal.id]: {
            at: Date.now(),
            ok: false,
            message: err instanceof Error ? err.message : 'Failed'
          }
        }))
      }
    }
    setApproving(null)
    setRunAllBusy(false)
    onRefresh?.()
  }

  return {
    ready,
    meta: safeMeta,
    approvedActions,
    pending,
    pendingCount: pending.length,
    showRunAll,
    approving,
    runAllBusy,
    approve,
    runAll
  }
}

export function MeetingActionRunAllButton({
  approvals,
  className = 'x-run-all-btn',
  tone = 'primary'
}: {
  approvals: MeetingActionApprovals
  className?: string
  tone?: 'primary' | 'text'
}) {
  if (!approvals.showRunAll) return null
  const { pending, runAllBusy, approving, runAll } = approvals
  const label = runAllBusy ? `Running ${pending.length}…` : `Run all (${pending.length})`
  if (tone === 'text') {
    return (
      <button
        type="button"
        className={`x-post-call-text-btn ${className}`}
        disabled={runAllBusy || Boolean(approving)}
        onClick={() => void runAll()}
      >
        {label}
      </button>
    )
  }
  return (
    <button
      type="button"
      className={`x-action-btn x-action-btn-primary ${className}`}
      disabled={runAllBusy || Boolean(approving)}
      onClick={() => void runAll()}
    >
      {label}
    </button>
  )
}

export function MeetingActionCards({
  event,
  onRefresh,
  variant = 'inline',
  hideRunAll = false,
  approvals: external
}: Props) {
  const internal = useMeetingActionApprovals(event, onRefresh)
  const a = external ?? internal

  if (!a.ready || variant === 'inline') {
    return null
  }

  if (variant === 'simple') {
    return (
      <div className="x-meeting-actions x-meeting-actions-ios" onClick={(e) => e.stopPropagation()}>
        {!hideRunAll ? <MeetingActionRunAllButton approvals={a} /> : null}
        {a.meta.proposedActions.map((proposal, i) => (
          <div key={proposal.id} className={i > 0 ? 'x-post-call-row-divider' : undefined}>
            <SimpleActionRow
              proposal={proposal}
              approval={a.approvedActions[proposal.id]}
              loading={a.approving === proposal.id || (a.runAllBusy && !a.approvedActions[proposal.id]?.ok)}
              onRun={(e) => void a.approve(proposal.id, e)}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`x-meeting-actions ${variant === 'deck' ? 'x-meeting-actions-deck' : ''}`} onClick={(e) => e.stopPropagation()}>
      {a.meta.proposedActions.map((proposal) => (
        <ActionCard
          key={proposal.id}
          proposal={proposal}
          approval={a.approvedActions[proposal.id]}
          loading={a.approving === proposal.id}
          routing={a.approvedActions[proposal.id]?.message === 'Routing…'}
          expanded={false}
          meta={event.meta}
          onToggle={() => {}}
          onApprove={(e) => void a.approve(proposal.id, e)}
        />
      ))}
    </div>
  )
}
