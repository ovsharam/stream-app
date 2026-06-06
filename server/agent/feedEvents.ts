import type { CentralStreamEvent } from '../../shared/cluster'
import type { AgentProposal } from '../../shared/agent-proposal'
import { listProposals } from './store'

export function agentProposalToStreamEvent(proposal: AgentProposal): CentralStreamEvent | null {
  if (proposal.status !== 'pending' || !proposal.brief?.humanSummary) return null

  return {
    id: `agent-${proposal.id}`,
    ts: proposal.updatedAt,
    source: 'notch',
    kind: 'action',
    title: `${proposal.senderName} · LinkedIn`,
    body: proposal.brief.humanSummary,
    highlight: 'Needs approval',
    meta: {
      agentProposalId: proposal.id,
      agentProposalStatus: proposal.status,
      agentBrief: JSON.stringify(proposal.brief),
      intent: proposal.intent,
      senderName: proposal.senderName,
      threadId: proposal.threadId,
      linkedinReplyDraft: proposal.linkedinReplyDraft,
      hasBookingTask: proposal.bookingTask ? 'true' : undefined
    }
  }
}

export function agentProposalStreamEvents(): CentralStreamEvent[] {
  return listProposals({ status: 'pending', limit: 20 })
    .map(agentProposalToStreamEvent)
    .filter((e): e is CentralStreamEvent => e != null)
}
