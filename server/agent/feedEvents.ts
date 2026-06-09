import type { CentralStreamEvent } from '../../shared/cluster'
import type { AgentProposal } from '../../shared/agent-proposal'
import { computeProposalUrgency } from '../../shared/agent-proposal-ui'
import { listProposals } from './store'

export function agentProposalToStreamEvent(proposal: AgentProposal): CentralStreamEvent | null {
  if (proposal.status !== 'pending' || !proposal.brief?.humanSummary) return null
  if (proposal.snoozedUntil && proposal.snoozedUntil > Date.now()) return null

  const detectedAt = proposal.detectedAt ?? proposal.createdAt

  return {
    id: `agent-${proposal.id}`,
    ts: proposal.updatedAt,
    source: 'linkedin',
    kind: 'action',
    title: proposal.senderName,
    body: proposal.rawMessage,
    highlight: 'Needs approval',
    meta: {
      agentProposalId: proposal.id,
      agentProposalStatus: proposal.status,
      agentBrief: JSON.stringify(proposal.brief),
      intent: proposal.intent,
      senderName: proposal.senderName,
      threadId: proposal.threadId,
      channel: 'LinkedIn',
      linkedinReplyDraft: proposal.linkedinReplyDraft,
      rawMessage: proposal.rawMessage,
      detectedAt,
      createdAt: proposal.createdAt,
      urgency: computeProposalUrgency({ intent: proposal.intent, brief: proposal.brief }),
      hasBookingTask: proposal.bookingTask ? 'true' : undefined
    }
  }
}

export function agentProposalStreamEvents(): CentralStreamEvent[] {
  return listProposals({ status: 'pending', limit: 20 })
    .map(agentProposalToStreamEvent)
    .filter((e): e is CentralStreamEvent => e != null)
}
