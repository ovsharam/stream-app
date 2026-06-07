import { randomUUID } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import type {
  AgentProposal,
  ApproveAgentProposalInput,
  LinkedInIngestInput
} from '../../shared/agent-proposal'
import { proposalDedupeKey } from '../../shared/agent-dedupe'
import { classifyLinkedInMessage, messageLooksActionable } from './classifier'
import { enrichRescheduleBooking } from './bookingContext'
import { buildAgentBrief, threadAsText } from './brief'
import { buildAgentActionProposals, summarizeAgentActions } from './actions'
import { bookingTaskToComposeCommand, resolveInvitee } from './invitee'
import { parseSchedulingTimeFromText } from '../sources/calcom'
import {
  findProposalByDedupeKey,
  getProposal,
  insertProposal,
  listInteractionLog,
  listProposals,
  logInteraction,
  updateProposal,
  countUniquePendingProposals
} from './store'
import { executeApprovedProposal } from './execute'
import { emitServerEvent } from '../telemetry/service'

function normalizeLinkedInSenderName(name: string): string {
  return name.replace(/\s+Status is offline[\s\S]*$/i, '').trim() || name.trim()
}

async function draftLinkedInProposal(input: LinkedInIngestInput, proposalId: string) {
  const threadText = threadAsText(input.threadMessages)
  const message = input.message.trim()
  const classifyMessage = threadText ? `${message}\n\nThread:\n${threadText}` : message
  const senderName = normalizeLinkedInSenderName(input.senderName.trim())

  let invitee = await resolveInvitee({ ...input, senderName })
  logInteraction(proposalId, 'invitee_resolved', invitee as unknown as Record<string, unknown>)

  const classified = await classifyLinkedInMessage(
    { ...input, senderName, message: classifyMessage },
    invitee
  )
  logInteraction(proposalId, 'intent_classified', classified as unknown as Record<string, unknown>)

  let bookingTask = classified.bookingTask
  if (
    !bookingTask &&
    (classified.intent === 'reschedule' || classified.intent === 'schedule_new')
  ) {
    bookingTask = {
      action: classified.intent === 'reschedule' ? 'reschedule' : 'book',
      inviteeEmails: invitee.emails,
      inviteeName: senderName,
      eventTypeSlug: process.env.CALCOM_DEFAULT_EVENT_TYPE_SLUG ?? '30min',
      durationMin: 30,
      proposedTimes: [],
      originalBookingUid: classified.intent === 'reschedule' ? invitee.bookingUid : undefined,
      notes: `LinkedIn: ${message.slice(0, 200)}`,
      sourceThreadId: input.threadId,
      confidence: invitee.confidence * 0.8
    }
  }
  if (bookingTask && bookingTask.inviteeEmails.length === 0 && invitee.emails.length > 0) {
    bookingTask = { ...bookingTask, inviteeEmails: invitee.emails, inviteeName: senderName }
  }
  if (bookingTask?.action === 'reschedule') {
    const enriched = await enrichRescheduleBooking(senderName, classifyMessage, bookingTask, invitee)
    bookingTask = enriched.task
    invitee = enriched.invitee
    logInteraction(proposalId, 'booking_context', enriched.context as unknown as Record<string, unknown>)
  } else if (
    bookingTask &&
    (!bookingTask.proposedTimes?.length || bookingTask.proposedTimes.length === 0)
  ) {
    const parsed = parseSchedulingTimeFromText(classifyMessage)
    if (parsed) bookingTask = { ...bookingTask, proposedTimes: [parsed] }
  }
  if (bookingTask?.action === 'reschedule' && invitee.bookingUid && !bookingTask.originalBookingUid) {
    bookingTask = { ...bookingTask, originalBookingUid: invitee.bookingUid }
  }
  if (bookingTask) {
    try {
      bookingTask.composeCommand = bookingTaskToComposeCommand(bookingTask)
    } catch {
      /* partial task */
    }
  }

  return {
    senderName,
    classified,
    bookingTask,
    invitee
  }
}

async function attachAgentContext(
  proposal: AgentProposal,
  io?: SocketServer
): Promise<AgentProposal> {
  proposal.actionProposals = await buildAgentActionProposals(proposal)
  proposal.brief = await buildAgentBrief(proposal, proposal.threadMessages)
  if (proposal.brief && proposal.actionProposals.length) {
    proposal.brief.suggestedAction = summarizeAgentActions(proposal.actionProposals)
  }
  proposal.updatedAt = Date.now()
  updateProposal(proposal)

  logInteraction(proposal.id, 'context_built', {
    humanSummary: proposal.brief.humanSummary,
    calendarCheck: proposal.brief.calendarCheck,
    actionProposals: proposal.actionProposals,
    kbExcerptCount: proposal.brief.kbExcerpts?.length ?? 0,
    graphHitCount: proposal.brief.graphHits?.length ?? 0
  })

  emitServerEvent(
    'agent_brief_ready',
    {
      proposalId: proposal.id,
      humanSummary: proposal.brief.humanSummary,
      senderName: proposal.senderName,
      intent: proposal.intent,
      threadId: proposal.threadId
    },
    { subjectType: 'agent_proposal', subjectId: proposal.id, surface: 'linkedin' }
  )

  io?.emit('agent:brief', proposal)
  io?.emit('cluster:refresh', { reason: 'agent-brief' })
  return proposal
}

export async function ingestLinkedInMessage(
  input: LinkedInIngestInput,
  io?: SocketServer
): Promise<{ proposal: AgentProposal; duplicate?: boolean }> {
  const threadId = input.threadId.trim()
  const message = input.message.trim()
  if (!threadId || !message || !input.senderName.trim()) {
    throw new Error('threadId, senderName, and message are required')
  }

  const dedupeKey = proposalDedupeKey({
    threadId,
    senderName: input.senderName.trim(),
    rawMessage: message
  })
  const existing = findProposalByDedupeKey(dedupeKey)
  if (existing) {
    return { proposal: existing, duplicate: true }
  }

  if (!messageLooksActionable(message)) {
    throw new Error('Message does not look actionable — skipped')
  }

  const now = Date.now()
  const proposalId = `ap-${randomUUID()}`

  logInteraction(proposalId, 'raw_message', {
    threadId,
    senderName: input.senderName,
    message,
    threadMessageCount: input.threadMessages?.length ?? 0,
    detectedAt: input.detectedAt ?? now
  })

  const draft = await draftLinkedInProposal(input, proposalId)

  const proposal: AgentProposal = {
    id: proposalId,
    source: 'linkedin',
    threadId,
    senderName: draft.senderName,
    senderProfileUrl: input.senderProfileUrl,
    rawMessage: message,
    intent: draft.classified.intent,
    confidence: draft.classified.confidence,
    linkedinReplyDraft: draft.classified.linkedinReplyDraft,
    bookingTask: draft.bookingTask,
    inviteeResolution: draft.invitee,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    threadMessages: input.threadMessages,
    dedupeKey
  }

  logInteraction(proposalId, 'drafts_created', {
    linkedinReplyDraft: proposal.linkedinReplyDraft,
    bookingTask: proposal.bookingTask,
    composeCommand: proposal.bookingTask?.composeCommand
  })

  insertProposal(proposal)

  emitServerEvent(
    'agent_proposal_created',
    {
      proposalId,
      intent: proposal.intent,
      threadId,
      hasBookingTask: Boolean(draft.bookingTask)
    },
    { subjectType: 'agent_proposal', subjectId: proposalId, surface: 'linkedin' }
  )

  io?.emit('agent:proposal', proposal)
  const enriched = await attachAgentContext(proposal, io)
  return { proposal: enriched }
}

export function getAgentProposal(id: string): AgentProposal | null {
  return getProposal(id)
}

export function listAgentProposals(status?: AgentProposal['status']): AgentProposal[] {
  return listProposals({ status, limit: 50 })
}

export function countAgentPendingProposals(): number {
  return countUniquePendingProposals()
}

export function getAgentProposalLog(id: string) {
  return listInteractionLog(id)
}

export async function refreshAgentProposal(id: string, io?: SocketServer): Promise<AgentProposal> {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error('Only pending proposals can be refreshed')

  const draft = await draftLinkedInProposal(
    {
      threadId: proposal.threadId,
      senderName: proposal.senderName,
      senderProfileUrl: proposal.senderProfileUrl,
      message: proposal.rawMessage,
      threadMessages: proposal.threadMessages
    },
    id
  )

  proposal.senderName = draft.senderName
  proposal.intent = draft.classified.intent
  proposal.confidence = draft.classified.confidence
  proposal.linkedinReplyDraft = draft.classified.linkedinReplyDraft
  proposal.bookingTask = draft.bookingTask
  proposal.inviteeResolution = draft.invitee
  proposal.updatedAt = Date.now()

  updateProposal(proposal)
  logInteraction(id, 'drafts_created', {
    refreshed: true,
    linkedinReplyDraft: proposal.linkedinReplyDraft,
    bookingTask: proposal.bookingTask,
    composeCommand: proposal.bookingTask?.composeCommand
  })

  const refreshed = await attachAgentContext(proposal, io)
  io?.emit('agent:proposal-updated', refreshed)
  return refreshed
}

export async function approveAgentProposal(
  id: string,
  input: ApproveAgentProposalInput,
  io?: SocketServer
): Promise<AgentProposal> {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`)

  const now = Date.now()
  proposal.linkedinReplyDraft = input.linkedinReply?.trim() || proposal.linkedinReplyDraft
  if (proposal.bookingTask && input.bookingTask) {
    proposal.bookingTask = { ...proposal.bookingTask, ...input.bookingTask }
    if (input.bookingTask.inviteeEmails?.length) {
      proposal.inviteeResolution = {
        ...proposal.inviteeResolution,
        emails: input.bookingTask.inviteeEmails,
        method: 'manual',
        confidence: 1
      }
    }
    try {
      proposal.bookingTask.composeCommand = bookingTaskToComposeCommand(proposal.bookingTask)
    } catch {
      /* validated on execute */
    }
  }

  proposal.status = 'approved'
  proposal.approvedAt = now
  proposal.updatedAt = now
  logInteraction(id, 'user_approved', {
    linkedinReply: proposal.linkedinReplyDraft,
    bookingTask: proposal.bookingTask,
    skipBooking: input.skipBooking ?? false
  })

  updateProposal(proposal)
  const executed = await executeApprovedProposal(proposal, { skipBooking: input.skipBooking }, io)
  updateProposal(executed)
  io?.emit('agent:proposal-updated', executed)
  io?.emit('cluster:refresh', { reason: 'agent-proposal' })
  return executed
}

export function rejectAgentProposal(id: string, reason?: string, io?: SocketServer): AgentProposal {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`)

  proposal.status = 'rejected'
  proposal.updatedAt = Date.now()
  logInteraction(id, 'user_rejected', { reason: reason ?? '' })
  updateProposal(proposal)
  emitServerEvent('agent_proposal_rejected', { proposalId: id, reason }, { subjectId: id })
  io?.emit('agent:proposal-updated', proposal)
  io?.emit('cluster:refresh', { reason: 'agent-proposal' })
  return proposal
}
