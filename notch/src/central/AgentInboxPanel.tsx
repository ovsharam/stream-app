import { useCallback, useEffect, useState } from 'react'
import type { AgentProposal } from '@shared/agent-proposal'
import { agentApi } from '../lib/api'
import {
  bookingTaskFields,
  bookingTaskWarnings,
  formatBookingTaskPreview
} from './agentBookingTask'

function intentLabel(intent: AgentProposal['intent']): string {
  return intent.replace(/_/g, ' ')
}

type ApproveNotice = {
  senderName: string
  replyText: string
  bookingMessage?: string
  bookingOk?: boolean
  copied?: boolean
}

export function AgentInboxPanel() {
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<ApproveNotice | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      setProposals(data.proposals)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load agent inbox')
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 12_000)
    const onProposal = () => void load()
    window.addEventListener('notch:agent-proposal', onProposal)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('notch:agent-proposal', onProposal)
    }
  }, [load])

  const copyText = async (text: string, markCopied?: 'reply') => {
    try {
      await navigator.clipboard.writeText(text)
      if (markCopied === 'reply') {
        setNotice((prev) => (prev ? { ...prev, copied: true } : prev))
      }
    } catch {
      /* ignore */
    }
  }

  const approve = async (p: AgentProposal) => {
    setBusyId(p.id)
    setNotice(null)
    try {
      const { proposal } = await agentApi.approveProposal(p.id, {})
      const booking = proposal.executionLog?.booking
      setNotice({
        senderName: p.senderName,
        replyText: proposal.linkedinReplyDraft,
        bookingMessage: booking?.message,
        bookingOk: booking?.ok
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const refresh = async (p: AgentProposal) => {
    setBusyId(p.id)
    setError(null)
    try {
      await agentApi.refreshProposal(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (p: AgentProposal) => {
    setBusyId(p.id)
    try {
      await agentApi.rejectProposal(p.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="x-rail-tab-body x-agent-inbox">
      <div className="x-cal-head">
        <h2>Agent inbox</h2>
        <p className="x-cal-sub">LinkedIn → intent → reply + connected app tasks</p>
      </div>
      {notice ? (
        <div
          className={`x-agent-notice${notice.bookingOk === false ? ' x-agent-notice-warn' : ' x-agent-notice-ok'}`}
          role="status"
        >
          <p className="x-agent-notice-title">
            {notice.bookingOk === false
              ? `Approved with booking issue — ${notice.senderName}`
              : notice.bookingMessage
                ? `Approved — ${notice.senderName}`
                : `Approved — reply ready for ${notice.senderName}`}
          </p>
          {notice.bookingMessage ? (
            <p className="x-agent-notice-detail">{notice.bookingMessage}</p>
          ) : null}
          <div className="x-agent-notice-actions">
            <button type="button" className="x-int-btn" onClick={() => void copyText(notice.replyText, 'reply')}>
              {notice.copied ? 'Reply copied' : 'Copy reply'}
            </button>
            <button
              type="button"
              className="x-int-btn x-int-btn-ghost"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="x-cal-empty">{error}</p> : null}
      {proposals.length === 0 ? (
        <p className="x-cal-empty">
          No pending proposals. New LinkedIn messages with scheduling intent appear here for approval.
        </p>
      ) : (
        <ul className="x-agent-inbox-list">
          {proposals.map((p) => (
            <li key={p.id} className="x-agent-card">
              <header className="x-agent-card-head">
                <strong>{p.senderName}</strong>
                <span className="x-agent-intent">{intentLabel(p.intent)}</span>
              </header>
              <p className="x-agent-snippet">{p.rawMessage.slice(0, 220)}</p>
              {p.brief?.humanSummary ? (
                <p className="x-agent-brief">{p.brief.humanSummary}</p>
              ) : null}
              <section className="x-agent-draft">
                <h4>LinkedIn reply</h4>
                <p>{p.linkedinReplyDraft}</p>
              </section>
              {p.actionProposals?.length ? (
                <section className="x-agent-draft x-agent-actions-list">
                  <h4>Suggested actions</h4>
                  <ul className="x-agent-action-proposals">
                    {p.actionProposals.map((action) => (
                      <li key={action.id} className="x-agent-action-row">
                        <span className={`x-agent-action-provider x-agent-action-${action.provider}`}>
                          {action.provider}
                        </span>
                        <div className="x-agent-action-body">
                          <strong>{action.label}</strong>
                          <p>{action.description}</p>
                          <code className="x-agent-compose">{action.composeText}</code>
                        </div>
                        <button
                          type="button"
                          className="x-int-btn x-int-btn-ghost x-agent-copy-task"
                          onClick={() => void copyText(action.composeText)}
                        >
                          Copy
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : p.bookingTask ? (
                <section className="x-agent-draft x-agent-booking">
                  <div className="x-agent-draft-head">
                    <h4>Cal.com task</h4>
                    <span className="x-agent-booking-action">{p.bookingTask.action}</span>
                  </div>
                  <p className="x-agent-compose">{formatBookingTaskPreview(p.bookingTask)}</p>
                  <dl className="x-agent-booking-meta">
                    {bookingTaskFields(p.bookingTask, p)
                      .filter((row) => row.label !== 'Compose')
                      .map((row) => (
                        <div key={row.label} className="x-agent-booking-row">
                          <dt>{row.label}</dt>
                          <dd>{row.value}</dd>
                        </div>
                      ))}
                  </dl>
                  {bookingTaskWarnings(p.bookingTask, p).map((warn) => (
                    <p key={warn} className="x-agent-warn">
                      {warn}
                    </p>
                  ))}
                  <button
                    type="button"
                    className="x-int-btn x-int-btn-ghost x-agent-copy-task"
                    onClick={() => void copyText(formatBookingTaskPreview(p.bookingTask!))}
                  >
                    Copy Cal.com command
                  </button>
                </section>
              ) : null}
              <div className="x-agent-actions">
                <button
                  type="button"
                  className="x-int-btn"
                  disabled={busyId === p.id}
                  onClick={() => void approve(p)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  disabled={busyId === p.id}
                  onClick={() => void copyText(p.linkedinReplyDraft)}
                >
                  Copy reply
                </button>
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  disabled={busyId === p.id}
                  onClick={() => void refresh(p)}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="x-int-btn x-int-btn-ghost"
                  disabled={busyId === p.id}
                  onClick={() => void reject(p)}
                >
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
