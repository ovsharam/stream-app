import { type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { parseAgentProposalFeedMeta } from '@shared/agent-proposal-ui'
import { AgentProposalActionCard } from './AgentProposalActionCard'

type Props = {
  event: CentralStreamEvent
  onRefresh?: () => void
}

export function AgentProposalFeedCard({ event, onRefresh }: Props) {
  const feed = parseAgentProposalFeedMeta(event.meta, event)

  if (!feed) return null

  return (
    <AgentProposalActionCard
      surface="feed"
      feed={feed}
      eventTs={event.ts}
      onActionComplete={onRefresh}
      onClickStop={(e: MouseEvent) => e.stopPropagation()}
    />
  )
}
