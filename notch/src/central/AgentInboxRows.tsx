import type { AgentProposal } from '@shared/agent-proposal'
import type { AgentInboxDraftItem, AgentInboxStatusItem } from './agentInboxItems'
import { AgentProposalActionCard } from './AgentProposalActionCard'

export function AgentInboxStatusRow({
  item,
  onOpenBuildDojo
}: {
  item: AgentInboxStatusItem
  onOpenBuildDojo?: () => void
}) {
  return (
    <article className="x-agent-status-card">
      <div className="x-agent-status-card-main">
        <span className="x-agent-status-live" aria-hidden />
        <div className="x-agent-status-card-copy">
          <span className="x-agent-status-channel">{item.channel}</span>
          <p className="x-agent-status-project">{item.projectName}</p>
        </div>
      </div>
      {onOpenBuildDojo ? (
        <button type="button" className="x-agent-status-go" onClick={() => onOpenBuildDojo()}>
          Open {item.destinationLabel}
        </button>
      ) : null}
    </article>
  )
}

export function AgentInboxDraftRow({
  item,
  onComplete
}: {
  item: AgentInboxDraftItem
  onComplete: () => void
}) {
  return (
    <AgentProposalActionCard
      surface="inbox"
      proposal={item.proposal as AgentProposal}
      onActionComplete={onComplete}
    />
  )
}
