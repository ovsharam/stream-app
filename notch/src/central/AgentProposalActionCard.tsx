import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { AgentProposal } from '@shared/agent-proposal'
import {
  formatRemindLaterLabel,
  loadAgentActionSettings
} from '@shared/agent-action-settings'
import {
  agentProposalToCardData,
  cleanLinkedInMessage,
  cleanLinkedInSenderName,
  formatProposalAge,
  summarizeInboundMessage,
  summarizeReplyDraft,
  type AgentProposalFeedCardData
} from '@shared/agent-proposal-ui'
import { IconLinkedin } from './Icons'
import { useAgentProposalActions, type ProposalResolvedAction } from './useAgentProposalActions'

type Props = {
  surface: 'inbox' | 'feed'
  proposal?: AgentProposal
  feed?: AgentProposalFeedCardData
  eventTs?: number
  onActionComplete?: () => void
  onClickStop?: (e: MouseEvent) => void
}

function senderInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase()
}

function terminalBanner(action: ProposalResolvedAction, senderName: string): string {
  const name = cleanLinkedInSenderName(senderName)
  if (action === 'sent') return `Sent on LinkedIn — ${name}`
  if (action === 'reminded') {
    const label = formatRemindLaterLabel(loadAgentActionSettings().remindLaterMs)
    return `Remind in ${label.toLowerCase()} — draft saved for ${name}`
  }
  if (action === 'cleared') return `Cleared — ${name}`
  return `Updated — ${name}`
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
  const { sendFromHere, clear, remindLater, saveDraft, regenerate, isBusy } = useAgentProposalActions()
  const [resolved, setResolved] = useState<ProposalResolvedAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const remindLabel = formatRemindLaterLabel(loadAgentActionSettings().remindLaterMs)

  useEffect(() => {
    if (data?.linkedinReplyDraft) setDraft(data.linkedinReplyDraft)
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
    }
  }, [])

  if (!data) return null

  const busy = isBusy(data.proposalId)
  const ageTs = data.detectedAt ?? eventTs ?? data.createdAt
  const sender = cleanLinkedInSenderName(data.senderName)
  const themSummary = summarizeInboundMessage(data)
  const youSummary = summarizeReplyDraft(draft)
  const fullMessage = cleanLinkedInMessage(data.rawMessage, data.senderName)
  const terminal = resolved ?? (data.status && data.status !== 'pending' ? mapStatus(data.status) : null)
  const showActions = !terminal

  const queueSaveDraft = (text: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(data.proposalId, text)
    }, 650)
  }

  const handleDraftChange = (text: string) => {
    setDraft(text)
    queueSaveDraft(text)
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
    setError(null)
    const result = await clear(data.proposalId)
    if (!result.ok) setError(result.error)
    else {
      setResolved('cleared')
      onActionComplete?.()
    }
  }

  const handleRemind = async (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    setError(null)
    const result = await remindLater(data.proposalId, draft)
    if (!result.ok) setError(result.error)
    else {
      setResolved('reminded')
      onActionComplete?.()
    }
  }

  const handleRegenerate = async (e: MouseEvent<HTMLButtonElement>) => {
    onClickStop?.(e)
    setError(null)
    setRegenerating(true)
    const result = await regenerate(data.proposalId)
    setRegenerating(false)
    if (!result.ok) setError(result.error)
    else setDraft(result.proposal.linkedinReplyDraft)
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
        <time className="x-li-draft-time">{formatProposalAge(ageTs)}</time>
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
        <div className="x-li-draft-bubble x-li-draft-bubble-in">
          <p>{themSummary}</p>
        </div>
        <div className="x-li-draft-bubble x-li-draft-bubble-out">
          <span className="x-li-draft-bubble-tag">Your draft</span>
          <p>{youSummary}</p>
        </div>
      </div>

      {showActions ? (
        <div className="x-li-draft-actions">
          <button
            type="button"
            className="x-li-draft-send"
            disabled={busy}
            onClick={handleSend}
          >
            {busy ? 'Sending…' : 'Send on LinkedIn'}
          </button>
          <div className="x-li-draft-secondary">
            <button type="button" className="x-li-draft-link" disabled={busy} onClick={handleClear}>
              Clear
            </button>
            <span className="x-li-draft-dot" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="x-li-draft-link"
              disabled={busy}
              onClick={handleRemind}
              title={`Save draft · remind in ${remindLabel.toLowerCase()}`}
            >
              Remind {remindLabel.toLowerCase()}
            </button>
          </div>
        </div>
      ) : null}

      {!terminal ? (
        <button
          type="button"
          className="x-li-draft-expand"
          onClick={(e) => {
            onClickStop?.(e)
            setExpanded((v) => !v)
          }}
        >
          <span>{expanded ? 'Hide editor' : 'Edit & regenerate'}</span>
          <svg viewBox="0 0 16 16" className="x-li-draft-chevron" aria-hidden>
            <path
              fill="currentColor"
              d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
            />
          </svg>
        </button>
      ) : null}

      {expanded && !terminal ? (
        <div className="x-li-draft-editor">
          <div className="x-li-draft-editor-section">
            <span className="x-li-draft-editor-label">Their message</span>
            <p className="x-li-draft-editor-body">{fullMessage}</p>
          </div>
          <div className="x-li-draft-editor-section">
            <div className="x-li-draft-editor-head">
              <span className="x-li-draft-editor-label">Reply</span>
              <button
                type="button"
                className="x-li-draft-regen"
                disabled={busy || regenerating}
                onClick={handleRegenerate}
              >
                {regenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
            <textarea
              className="x-li-draft-textarea"
              value={draft}
              rows={5}
              onChange={(e) => handleDraftChange(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
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
