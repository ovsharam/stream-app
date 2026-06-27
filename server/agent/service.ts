import { randomUUID } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import type {
  AgentProposal,
  ApproveAgentProposalInput,
  LinkedInIngestInput
} from '../../shared/agent-proposal'
import { proposalDedupeKey } from '../../shared/agent-dedupe'
import { cleanLinkedInSenderName } from '../../shared/agent-proposal-ui'
import { resolveLinkedInInboundMessage } from '../../shared/linkedin-ingest'
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
import { recordComposeAction } from '../kb/telemetry'
import { upsertEngagementFromAgentProposal } from '../fde/engagementFromProposal'
import { ingestAgentProposal } from '../kb/pipeline'

function normalizeLinkedInSenderName(name: string): string {
  return cleanLinkedInSenderName(name)
}

async function draftLinkedInProposal(
  input: LinkedInIngestInput,
  proposalId: string,
  opts?: { userDraft?: string }
) {
  const threadText = threadAsText(input.threadMessages)
  const message = input.message.trim()
  const classifyMessage = threadText ? `${message}\n\nThread:\n${threadText}` : message
  const senderName = normalizeLinkedInSenderName(input.senderName.trim())

  let invitee = await resolveInvitee({ ...input, senderName })
  logInteraction(proposalId, 'invitee_resolved', invitee as unknown as Record<string, unknown>)

  const classified = await classifyLinkedInMessage(
    { ...input, senderName, message: classifyMessage },
    invitee,
    opts?.userDraft ? { userDraft: opts.userDraft } : undefined
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
  if (!threadId || !input.senderName.trim()) {
    throw new Error('threadId, senderName, and message are required')
  }

  const inbound = resolveLinkedInInboundMessage(input)
  if (!inbound) {
    throw new Error('Latest message is outbound — no reply needed')
  }

  const message = inbound.message
  if (!message) {
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
  const detectedAt = input.detectedAt ?? now
  const proposalId = `ap-${randomUUID()}`

  logInteraction(proposalId, 'raw_message', {
    threadId,
    senderName: input.senderName,
    message,
    threadMessageCount: input.threadMessages?.length ?? 0,
    detectedAt: input.detectedAt ?? now
  })

  const draft = await draftLinkedInProposal({ ...input, message }, proposalId)

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
    detectedAt,
    threadMessages: input.threadMessages,
    dedupeKey
  }

  logInteraction(proposalId, 'drafts_created', {
    linkedinReplyDraft: proposal.linkedinReplyDraft,
    bookingTask: proposal.bookingTask,
    composeCommand: proposal.bookingTask?.composeCommand
  })

  insertProposal(proposal)

  try {
    const engagement = upsertEngagementFromAgentProposal(proposal, { stage: 'intake' })
    ingestAgentProposal(proposal, engagement)
    io?.emit('cluster:refresh', { reason: 'fde-engagement' })
  } catch (err) {
    console.warn('[fde] engagement from agent ingest skipped:', err instanceof Error ? err.message : err)
  }

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

export async function refreshAgentProposal(
  id: string,
  io?: SocketServer,
  opts?: { userDraft?: string }
): Promise<AgentProposal> {
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
    id,
    opts
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

  try {
    upsertEngagementFromAgentProposal(executed, { stage: 'intake', bumpEscalation: false })
    io?.emit('cluster:refresh', { reason: 'fde-engagement' })
  } catch (err) {
    console.warn('[fde] engagement from agent approve skipped:', err instanceof Error ? err.message : err)
  }

  recordComposeAction({
    operatorId: 'local',
    subjectId: id,
    contextItemId: `agent-${id}`,
    provider: 'linkedin',
    actionKind: 'send',
    rawCommand: executed.linkedinReplyDraft.slice(0, 240),
    ok: executed.status === 'executed' || executed.status === 'approved' || executed.status === 'partial',
    startedAt: now
  })

  io?.emit('agent:proposal-updated', executed)
  io?.emit('cluster:refresh', { reason: 'agent-proposal' })
  return executed
}

export function rejectAgentProposal(id: string, reason?: string, io?: SocketServer): AgentProposal {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`)

  const now = Date.now()
  proposal.status = 'rejected'
  proposal.updatedAt = now
  logInteraction(id, 'user_rejected', { reason: reason ?? '' })
  updateProposal(proposal)

  recordComposeAction({
    operatorId: 'local',
    subjectId: id,
    contextItemId: `agent-${id}`,
    provider: 'linkedin',
    actionKind: 'reject',
    rawCommand: reason?.trim() || `reject agent proposal ${id}`,
    ok: true,
    startedAt: now
  })
  emitServerEvent('agent_proposal_rejected', { proposalId: id, reason }, { subjectId: id })
  io?.emit('agent:proposal-updated', proposal)
  io?.emit('cluster:refresh', { reason: 'agent-proposal' })
  return proposal
}

export function updateAgentProposalDraft(
  id: string,
  linkedinReply: string,
  io?: SocketServer
): AgentProposal {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`)

  const original = proposal.linkedinReplyDraft
  const edited = linkedinReply.trim()
  if (original !== edited) {
    logInteraction(id, 'user_draft_edited', {
      originalLength: original.length,
      editedLength: edited.length,
      editKind: classifyDraftEdit(original, edited),
      agentDraft: original.slice(0, 500),
      userDraft: edited.slice(0, 500)
    })
  }

  proposal.linkedinReplyDraft = edited
  proposal.updatedAt = Date.now()
  updateProposal(proposal)
  io?.emit('agent:proposal-updated', proposal)
  return proposal
}

function classifyDraftEdit(original: string, edited: string): string {
  if (original === edited) return 'unchanged'
  if (!original.trim()) return 'replace'
  if (!edited.trim()) return 'delete'
  if (edited.startsWith(original) && edited.length > original.length) return 'append'
  if (original.startsWith(edited) && edited.length < original.length) return 'truncate'
  return 'modify'
}

export function snoozeAgentProposal(
  id: string,
  input: import('../../shared/agent-proposal').SnoozeAgentProposalInput,
  io?: SocketServer
): AgentProposal {
  const proposal = getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status !== 'pending') throw new Error(`Proposal already ${proposal.status}`)

  const now = Date.now()
  const defaultMs = 24 * 60 * 60 * 1000
  const snoozedUntil =
    input.snoozedUntil ??
    now + (input.remindInMs && input.remindInMs > 0 ? input.remindInMs : defaultMs)

  if (input.linkedinReply?.trim()) {
    proposal.linkedinReplyDraft = input.linkedinReply.trim()
  }

  proposal.snoozedUntil = snoozedUntil
  proposal.updatedAt = now
  logInteraction(id, 'user_snoozed', {
    snoozedUntil,
    linkedinReplyDraft: proposal.linkedinReplyDraft
  })
  updateProposal(proposal)

  try {
    upsertEngagementFromAgentProposal(proposal, { stage: 'intake', bumpEscalation: true })
    io?.emit('cluster:refresh', { reason: 'fde-engagement' })
  } catch (err) {
    console.warn('[fde] engagement from agent snooze skipped:', err instanceof Error ? err.message : err)
  }

  recordComposeAction({
    operatorId: 'local',
    subjectId: id,
    contextItemId: `agent-${id}`,
    provider: 'linkedin',
    actionKind: 'snooze',
    rawCommand: `remind later until ${new Date(snoozedUntil).toISOString()}`,
    ok: true,
    startedAt: now
  })

  io?.emit('agent:proposal-updated', proposal)
  io?.emit('cluster:refresh', { reason: 'agent-proposal' })
  return proposal
}
