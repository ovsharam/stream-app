import type { AgentProposal } from '@shared/agent-proposal'
import { trackOperatorEvent } from '../lib/operatorTelemetry'

export type LinkedInProposalSource = {
  threadId: string
  senderName?: string
  senderProfileUrl?: string
  proposalId?: string
}

export function openLinkedInProposalSource(opts: LinkedInProposalSource): void {
  const threadId = opts.threadId?.trim()
  if (!threadId) return

  trackOperatorEvent(
    'agent_proposal_view',
    {
      proposalId: opts.proposalId,
      via: 'go_to_source',
      source: 'linkedin',
      threadId
    },
    {
      surface: 'agent_inbox',
      subjectType: 'agent_proposal',
      subjectId: opts.proposalId
    }
  )

  window.dispatchEvent(
    new CustomEvent('notch:open-linkedin-thread', {
      detail: { threadId, senderName: opts.senderName }
    })
  )

  window.dispatchEvent(
    new CustomEvent('notch:linkedin-focus-thread', {
      detail: { threadId, senderName: opts.senderName }
    })
  )
}

export function openAgentProposalSource(
  proposal: Pick<AgentProposal, 'id' | 'source' | 'threadId' | 'senderName' | 'senderProfileUrl'>
): void {
  if (proposal.source === 'linkedin') {
    openLinkedInProposalSource({
      threadId: proposal.threadId,
      senderName: proposal.senderName,
      senderProfileUrl: proposal.senderProfileUrl,
      proposalId: proposal.id
    })
  }
}

export function agentProposalGoToLabel(source: AgentProposal['source']): string {
  if (source === 'linkedin') return 'Go to message on LinkedIn'
  return 'Go to source'
}
