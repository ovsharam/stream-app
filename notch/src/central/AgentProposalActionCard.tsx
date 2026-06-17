import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { AgentProposal } from '@shared/agent-proposal'
import {
  cleanLinkedInSenderName,
  formatProposalAge,
  summarizeInboundMessage,
  proposalInboundMessage,
  agentProposalToCardData,
  type AgentProposalFeedCardData
} from '@shared/agent-proposal-ui'
import { IconLinkedin, IconSend } from './Icons'
import { agentProposalGoToLabel, openLinkedInProposalSource } from './openAgentProposalSource'
import {
  dispatchProposalDismissCancelled,
  dispatchProposalDismissPending,
  useAgentProposalActions,
  type ProposalResolvedAction
} from './useAgentProposalActions'

type Props = {
  surface: 'inbox' | 'feed'
  proposal?: AgentProposal
  feed?: AgentProposalFeedCardData
  eventTs?: number
  onActionComplete?: () => void
  onClickStop?: (e: MouseEvent) => void
}

const DISMISS_UNDO_MS = 30_000

function senderInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function terminalBanner(action: ProposalResolvedAction, senderName: string): string {
  const name = cleanLinkedInSenderName(senderName)
  if (action === 'sent') return `Sent on LinkedIn — ${name}`
  if (action === 'reminded') return `Reminded — draft saved for ${name}`
  if (action === 'cleared') return `Dismissed — ${name}`
  return `Updated — ${name}`
}

function IconDismiss({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"
      />
    </svg>
  )
}

function IconRegenerate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M8 2.5a5.5 5.5 0 0 0-4.78 2.75.75.75 0 1 0 1.3.75A4 4 0 1 1 4 8H2.75a.75.75 0 0 0 0 1.5H5.5a.75.75 0 0 0 .75-.75V5.5a.75.75 0 0 0-1.5 0V7.1A5.48 5.48 0 0 0 8 2.5z"
      />
    </svg>
  )
}

export function AgentProposalActionCard({
  surface,
  proposal,
  feed,
  eventTs,
  onActionComplete,
  onClickStop
}: Props) {
  const data = feed ?? (proposal ? agentProposalToCardData(proposal) : null)
  const { sendFromHere, clear, saveDraft, regenerate, isBusy } = useAgentProposalActions()
  const [resolved, setResolved] = useState<ProposalResolvedAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0)
  const saveTimer = useRef<number | null>(null)
  const dismissTimer = useRef<number | null>(null)
  const dismissDeadline = useRef<number | null>(null)
  const undoTick = useRef<number | null>(null)

  const agentDraftRef = useRef(data?.linkedinReplyDraft ?? '')

  useEffect(() => {
    if (data?.linkedinReplyDraft) {
      setDraft(data.linkedinReplyDraft)
      agentDraftRef.current = data.linkedinReplyDraft
    }
  }, [data?.linkedinReplyDraft, data?.proposalId])

  useEffect(() => {
    const onResolved = (e: Event) => {
      const detail = (e as CustomEvent<{ proposalId: string; action: ProposalResolvedAction }>).detail
      if (!detail || detail.proposalId !== data?.proposalId) return
      setResolved(detail.action)
    }
    window.addEventListener('notch:agent-proposal-resolved', onResolved)
    return () => window.removeEventListener('notch:agent-proposal-resolved', onResolved)
  }, [data?.proposalId])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (dismissTimer.current) window.clearTimeout(dismissTimer.current)
      if (undoTick.current) window.clearInterval(undoTick.current)
    }
  }, [])

  if (!data) return null

  const busy = isBusy(data.proposalId)
  const ageTs = data.detectedAt ?? eventTs ?? data.createdAt
  const sender = cleanLinkedInSenderName(data.senderName)
  const inbound = proposalInboundMessage({
    rawMessage: data.rawMessage,
    senderName: data.senderName,
    threadMessages: data.threadMessages
  })
  const themSummary = summarizeInboundMessage({
    rawMessage: data.rawMessage,
    senderName: data.senderName,
    brief: data.brief,
    threadMessages: data.threadMessages
  })
  const outboundMisread = !inbound.fromThem
  const terminal = resolved ?? (data.status && data.status !== 'pending' ? mapStatus(data.status) : null)
  const showActions = !terminal && !outboundMisread

  const queueSaveDraft = (text: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(data.proposalId, text, agentDraftRef.current)
    }, 650)
  }

  const handleDraftChange = (text: string) => {
    setDraft(text)
    queueSaveDraft(text)
  }

  const clearDismissTimers = () => {
    if (dismissTimer.current) {
      window.clearTimeout(dismissTimer.current)
      dismissTimer.current = null
    }
    if (undoTick.current) {
      window.clearInterval(undoTick.current)
      undoTick.current = null
    }
    dismissDeadline.current = null
    setUndoSecondsLeft(0)
  }

  const finalizeDismiss = async () => {
    clearDismissTimers()
    setDismissing(false)
    setError(null)
    const result = await clear(data.proposalId)
    if (!result.ok) {
      dispatchProposalDismissCancelled(data.proposalId)
      setError(result.error)
    } else {
      setResolved('cleared')
      onActionComplete?.()
    }
  }

  const handleDismiss = (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    if (dismissing) return
    setError(null)
    setDismissing(true)
    dispatchProposalDismissPending(data.proposalId)
    dismissDeadline.current = Date.now() + DISMISS_UNDO_MS
    setUndoSecondsLeft(Math.ceil(DISMISS_UNDO_MS / 1000))
    undoTick.current = window.setInterval(() => {
      const deadline = dismissDeadline.current
      if (!deadline) return
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setUndoSecondsLeft(left)
      if (left <= 0 && undoTick.current) {
        window.clearInterval(undoTick.current)
        undoTick.current = null
      }
    }, 250)
    dismissTimer.current = window.setTimeout(() => {
      void finalizeDismiss()
    }, DISMISS_UNDO_MS)
  }

  const handleUndoDismiss = (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    clearDismissTimers()
    dispatchProposalDismissCancelled(data.proposalId)
    setDismissing(false)
  }

  const handleSend = async (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    setError(null)
    const result = await sendFromHere(data.proposalId, {
      threadId: data.threadId,
      linkedinReply: draft,
      senderName: data.senderName
    })
    if (!result.ok) setError(result.error)
    else {
      setResolved('sent')
      onActionComplete?.()
    }
  }

  const handleClear = async (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    clearDismissTimers()
    setDismissing(false)
    setError(null)
    const result = await clear(data.proposalId)
    if (!result.ok) setError(result.error)
    else {
      setResolved('cleared')
      onActionComplete?.()
    }
  }

  const handleRegenerate = async (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    setError(null)
    setRegenerating(true)
    const result = await regenerate(data.proposalId, draft)
    setRegenerating(false)
    if (!result.ok) setError(result.error)
    else {
      setDraft(result.proposal.linkedinReplyDraft)
      agentDraftRef.current = result.proposal.linkedinReplyDraft
    }
  }

  const handleGoTo = (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    if (!data.threadId) return
    openLinkedInProposalSource({
      threadId: data.threadId,
      senderName: data.senderName,
      proposalId: data.proposalId
    })
  }

  const goToLabel = agentProposalGoToLabel('linkedin')
  const canGoTo = Boolean(data.threadId)

  if (dismissing) {
    return (
      <article className={`x-li-draft x-li-draft-${surface} x-li-draft-undo-only`} onClick={onClickStop}>
        <div className="x-li-draft-undo" role="status">
          <span>Dismissed</span>
          <button type="button" className="x-li-draft-undo-btn" onClick={handleUndoDismiss}>
            Undo
          </button>
          {undoSecondsLeft > 0 ? (
            <span className="x-li-draft-undo-time">{undoSecondsLeft}s</span>
          ) : null}
        </div>
        {error ? <p className="x-li-draft-error">{error}</p> : null}
      </article>
    )
  }

  return (
    <article
      className={`x-li-draft x-li-draft-${surface}${expanded ? ' x-li-draft-open' : ''}`}
      onClick={onClickStop}
    >
      <header className="x-li-draft-top">
        <div className="x-li-draft-brand" aria-label="LinkedIn message">
          <IconLinkedin className="x-li-draft-icon" />
          <span>LinkedIn</span>
        </div>
        <div className="x-li-draft-top-actions">
          {canGoTo ? (
            <button type="button" className="x-li-draft-goto" disabled={busy} onClick={handleGoTo}>
              {goToLabel}
            </button>
          ) : null}
          <time className="x-li-draft-time">{formatProposalAge(ageTs)}</time>
          {showActions || (outboundMisread && !terminal) ? (
            <button
              type="button"
              className="x-li-draft-dismiss"
              disabled={busy}
              aria-label="Dismiss"
              title="Dismiss"
              onClick={outboundMisread ? handleClear : handleDismiss}
            >
              <IconDismiss className="x-li-draft-dismiss-icon" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="x-li-draft-contact">
        <div className="x-li-draft-avatar" aria-hidden>
          {senderInitials(sender)}
        </div>
        <div className="x-li-draft-contact-text">
          <strong className="x-li-draft-name">{sender}</strong>
          <span className="x-li-draft-meta">Message · draft ready</span>
        </div>
      </div>

      <div className="x-li-draft-thread">
        <div
          className={`x-li-draft-bubble ${outboundMisread ? 'x-li-draft-bubble-out' : 'x-li-draft-bubble-in'}`}
        >
          {outboundMisread ? (
            <span className="x-li-draft-bubble-tag">Your message</span>
          ) : (
            <span className="x-li-draft-bubble-tag">Their message</span>
          )}
          <p>{themSummary}</p>
        </div>
      </div>

      {outboundMisread && !terminal ? (
        <p className="x-li-draft-warn">
          This is a message you sent — not one you received. Dismiss it or wait for {sender} to reply.
        </p>
      ) : null}

      {showActions ? (
        <div className="x-li-draft-response">
          <span className="x-li-draft-response-label">My response</span>
          <div className="x-li-draft-response-field">
            <textarea
              className={`x-li-draft-response-input${expanded ? ' x-li-draft-response-input-open' : ''}`}
              value={draft}
              rows={expanded ? 8 : 3}
              disabled={busy || regenerating}
              onChange={(e) => handleDraftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <div className="x-li-draft-response-tools">
              <button
                type="button"
                className="x-li-draft-expand"
                aria-expanded={expanded}
                aria-label={expanded ? 'Collapse response' : 'Expand response'}
                title={expanded ? 'Collapse' : 'Expand'}
                onClick={(e) => {
                  onClickStop?.(e)
                  setExpanded((v) => !v)
                }}
              >
                <svg viewBox="0 0 16 16" className="x-li-draft-chevron" aria-hidden>
                  <path
                    fill="currentColor"
                    d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
                  />
                </svg>
              </button>
              <button
                type="button"
                className="x-li-draft-regen-btn"
                disabled={busy || regenerating}
                aria-label="Regenerate response"
                title="Regenerate with your edits"
                onClick={handleRegenerate}
              >
                <IconRegenerate className="x-li-draft-regen-icon" />
              </button>
              <button
                type="button"
                className="x-li-draft-send-btn"
                disabled={busy || !draft.trim()}
                aria-label="Send on LinkedIn"
                title="Send on LinkedIn"
                onClick={handleSend}
              >
                <IconSend className="x-li-draft-send-icon" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {terminal ? (
        <p className={`x-li-draft-status x-li-draft-status-${terminal}`} role="status">
          {terminalBanner(terminal, data.senderName)}
        </p>
      ) : null}

      {error ? <p className="x-li-draft-error">{error}</p> : null}
    </article>
  )
}

function mapStatus(status: AgentProposal['status']): ProposalResolvedAction | null {
  if (status === 'rejected') return 'cleared'
  if (status === 'approved' || status === 'executed' || status === 'partial') return 'sent'
  return null
}
