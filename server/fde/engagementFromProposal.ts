import type { AgentProposal } from '../../shared/agent-proposal'
import type { EngagementStage, FdeEngagement } from '../../shared/fde-engagement'
import { normalizeEngagementStage } from '../../shared/fde-context'
import { listEngagements, upsertEngagement } from './engagementStore'

function intentFlags(proposal: AgentProposal): string[] {
  const flags: string[] = ['LinkedIn inbound']
  if (proposal.intent === 'schedule_new' || proposal.intent === 'reschedule') {
    flags.push('Scheduling intent')
  }
  if (proposal.confidence < 0.55) flags.push('Low classifier confidence')
  return flags
}

function openQuestions(proposal: AgentProposal): string[] {
  const qs: string[] = []
  if (proposal.intent === 'schedule_new') qs.push('Which event type and attendees for the intro call?')
  if (proposal.intent === 'reschedule') qs.push('Confirm new slot with buyer before Cal.com move.')
  if (!proposal.inviteeResolution.emails.length) {
    qs.push('Resolve invitee email before booking automation.')
  }
  return qs
}

function nextStepsFromProposal(proposal: AgentProposal): string[] {
  const steps: string[] = []
  if (proposal.brief?.suggestedAction) steps.push(proposal.brief.suggestedAction)
  for (const action of proposal.actionProposals ?? []) {
    if (action.primary) steps.push(action.label)
  }
  if (steps.length === 0) steps.push('Review LinkedIn thread and confirm reply before send.')
  return steps
}

function mergeUnique(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])]
}

export function upsertEngagementFromAgentProposal(
  proposal: AgentProposal,
  opts?: { stage?: EngagementStage; bumpEscalation?: boolean }
): FdeEngagement {
  const clientName = proposal.senderName.trim()
  const existing = listEngagements(200).find(
    (e) =>
      e.clientName.toLowerCase() === clientName.toLowerCase() ||
      e.proposalIds?.includes(proposal.id)
  )

  const proposalIds = mergeUnique(existing?.proposalIds ?? [], [proposal.id])
  const signalSources = mergeUnique(existing?.signalSources ?? [], ['linkedin']) as FdeEngagement['signalSources']

  const summary =
    proposal.brief?.humanSummary ??
    existing?.summary ??
    `${clientName} reached out on LinkedIn (${proposal.intent.replace(/_/g, ' ')})`

  const existingStage = existing ? normalizeEngagementStage(existing.stage) : undefined
  const stage: EngagementStage =
    opts?.stage ??
    (existingStage === 'deploy'
      ? 'deploy'
      : existingStage === 'build'
        ? 'build'
        : 'intake')

  const scope = existing?.scope ?? 'unknown'

  return upsertEngagement({
    id: existing?.id,
    clientName: existing?.clientName ?? clientName,
    company: existing?.company,
    stage,
    scope,
    summary,
    buildPrompt: existing?.buildPrompt,
    nextSteps: mergeUnique(existing?.nextSteps ?? [], nextStepsFromProposal(proposal)),
    flags: mergeUnique(existing?.flags ?? [], intentFlags(proposal)),
    openQuestions: mergeUnique(existing?.openQuestions ?? [], openQuestions(proposal)),
    meetingIds: existing?.meetingIds ?? [],
    feedItemIds: mergeUnique(existing?.feedItemIds ?? [], [`agent-${proposal.id}`]),
    proposalIds,
    signalSources,
    escalationLevel:
      opts?.bumpEscalation && (existing?.escalationLevel ?? 0) < 1
        ? 1
        : (existing?.escalationLevel ?? 0)
  })
}
