import { useState, type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { parseAgentBriefMeta } from '@shared/agent-proposal'
import { agentApi } from '../lib/api'

type Props = {
  event: CentralStreamEvent
  onRefresh?: () => void
}

export function AgentProposalFeedCard({ event, onRefresh }: Props) {
  const parsed = parseAgentBriefMeta(event.meta)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!parsed) return null

  const { brief, proposalId } = parsed
  const calendar = brief.calendarCheck

  const approve = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      const { proposal } = await agentApi.approveProposal(proposalId, {})
      const booking = proposal.executionLog?.booking
      if (booking?.ok === false) {
        setStatus(`Approved — ${booking.message}`)
      } else if (booking?.message) {
        setStatus(`Done — ${booking.message}`)
      } else {
        setStatus('Approved — reply ready to paste in LinkedIn')
      }
      try {
        await navigator.clipboard.writeText(proposal.linkedinReplyDraft)
      } catch {
        /* optional */
      }
      onRefresh?.()
      window.dispatchEvent(new Event('notch:agent-proposal'))
      window.dispatchEvent(new Event('notch:stream-push'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setBusy(true)
    setError(null)
    try {
      await agentApi.rejectProposal(proposalId)
      setStatus('Dismissed')
      onRefresh?.()
      window.dispatchEvent(new Event('notch:agent-proposal'))
      window.dispatchEvent(new Event('notch:stream-push'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="x-agent-feed-card" onClick={(e) => e.stopPropagation()}>
      <p className="x-agent-feed-summary">{brief.humanSummary}</p>
      {calendar?.timeLabel ? (
        <p className={`x-agent-feed-calendar${calendar.isFree ? ' x-agent-feed-calendar-free' : ''}`}>
          {calendar.isFree
            ? `${calendar.timeLabel} is open on your calendar`
            : calendar.conflictingEvent
              ? `${calendar.timeLabel} conflicts with ${calendar.conflictingEvent}`
              : `${calendar.timeLabel} may not be free`}
        </p>
      ) : null}
      {brief.suggestedAction ? (
        <p className="x-agent-feed-action-hint">{brief.suggestedAction}</p>
      ) : null}
      {status ? (
        <p className="x-agent-feed-status">{status}</p>
      ) : (
        <div className="x-agent-feed-actions">
          <button type="button" className="x-action-btn x-action-btn-primary" disabled={busy} onClick={approve}>
            {busy ? 'Working…' : 'Approve'}
          </button>
          <button type="button" className="x-int-btn x-int-btn-ghost" disabled={busy} onClick={dismiss}>
            Dismiss
          </button>
        </div>
      )}
      {error ? <p className="x-agent-feed-error">{error}</p> : null}
    </div>
  )
}
