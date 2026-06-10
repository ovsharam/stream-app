import { type MouseEvent } from 'react'
import type { AgentProposal } from '@shared/agent-proposal'
import type { AgentInboxDraftItem, AgentInboxStatusItem } from './agentInboxItems'
import { AgentProposalActionCard } from './AgentProposalActionCard'
import { useAgentProposalActions } from './useAgentProposalActions'
import { agentProposalToCardData } from '@shared/agent-proposal-ui'

type InboxAction = {
  id: string
  label: string
  primary?: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
}

function InboxRowShell({
  live,
  channel,
  title,
  detail,
  actions
}: {
  live?: boolean
  channel: string
  title: string
  detail: string
  actions: InboxAction[]
}) {
  return (
    <article className="x-agent-inbox-item">
      <div className="x-agent-inbox-item-main">
        <span className={`x-agent-inbox-dot${live ? ' x-agent-inbox-dot-live' : ''}`} aria-hidden />
        <div className="x-agent-inbox-copy">
          <div className="x-agent-inbox-line">
            <span className="x-agent-inbox-channel">{channel}</span>
            <span className="x-agent-inbox-item-title">{title}</span>
          </div>
          {detail ? <p className="x-agent-inbox-detail">{detail}</p> : null}
        </div>
      </div>
      {actions.length > 0 ? (
        <div className="x-agent-inbox-actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={action.primary ? 'x-agent-inbox-btn x-agent-inbox-btn-primary' : 'x-agent-inbox-btn'}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  )
}

export function AgentInboxStatusRow({
  item,
  onOpenBuildDojo
}: {
  item: AgentInboxStatusItem
  onOpenBuildDojo?: () => void
}) {
  return (
    <article className="x-agent-inbox-item x-agent-inbox-item-status">
      <div className="x-agent-inbox-status-copy">
        <span className={`x-agent-inbox-dot x-agent-inbox-dot-live`} aria-hidden />
        <div>
          <p className="x-agent-inbox-status-agent">{item.channel}</p>
          <p className="x-agent-inbox-status-project">{item.projectName}</p>
        </div>
      </div>
      {onOpenBuildDojo ? (
        <button
          type="button"
          className="x-agent-inbox-status-go"
          onClick={() => onOpenBuildDojo()}
        >
          Go to {item.destinationLabel}
        </button>
      ) : null}
    </article>
  )
}

export function AgentInboxDraftRow({
  item,
  expanded,
  onToggleExpand,
  onComplete
}: {
  item: AgentInboxDraftItem
  expanded: boolean
  onToggleExpand: () => void
  onComplete: () => void
}) {
  const data = agentProposalToCardData(item.proposal)
  const { sendFromHere, clear, remindLater, isBusy } = useAgentProposalActions()
  const busy = isBusy(data.proposalId)

  const handleSend = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const result = await sendFromHere(data.proposalId, {
      threadId: data.threadId,
      linkedinReply: data.linkedinReplyDraft,
      senderName: data.senderName
    })
    if (result.ok) onComplete()
  }

  const handleDecline = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const result = await clear(data.proposalId)
    if (result.ok) onComplete()
  }

  const handleLater = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const result = await remindLater(data.proposalId, data.linkedinReplyDraft)
    if (result.ok) onComplete()
  }

  const actions: InboxAction[] = [
    {
      id: 'expand',
      label: expanded ? 'Collapse' : 'Expand',
      onClick: (e) => {
        e.stopPropagation()
        onToggleExpand()
      }
    },
    {
      id: 'send',
      label: busy ? 'Sending…' : 'Send',
      primary: true,
      disabled: busy,
      onClick: handleSend
    },
    {
      id: 'decline',
      label: 'Decline',
      disabled: busy,
      onClick: handleDecline
    },
    {
      id: 'later',
      label: 'Later',
      disabled: busy,
      onClick: handleLater
    }
  ]

  return (
    <li className="x-agent-inbox-entry">
      <InboxRowShell channel={item.channel} title={item.title} detail={item.detail} actions={actions} />
      {expanded ? (
        <div className="x-agent-inbox-expand">
          <AgentProposalActionCard
            surface="inbox"
            proposal={item.proposal as AgentProposal}
            onActionComplete={onComplete}
          />
        </div>
      ) : null}
    </li>
  )
}
