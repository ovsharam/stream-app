import type { Server as SocketServer } from 'socket.io'
import type { AgentProposal, BookingTaskPayload } from '../../shared/agent-proposal'
import {
  cancelCalcomBooking,
  createCalcomBooking,
  findCalcomBookingUidByEmail,
  parseCalcomBookBody,
  parseSchedulingTimeFromText,
  rescheduleCalcomBooking,
  syncCalcom
} from '../sources/calcom'
import { findCalcomBookingUidByAttendeeName } from './bookingContext'
import { bookingTaskToComposeCommand } from './invitee'
import { logInteraction } from './store'
import { emitServerEvent } from '../telemetry/service'

async function resolveBookingUid(
  task: BookingTaskPayload,
  proposal: AgentProposal
): Promise<string | undefined> {
  const direct = task.originalBookingUid ?? proposal.inviteeResolution.bookingUid
  if (direct?.trim()) return direct.trim()

  const email = task.inviteeEmails[0] ?? proposal.inviteeResolution.emails[0]
  if (email) {
    const byEmail = await findCalcomBookingUidByEmail(email)
    if (byEmail) return byEmail
  }

  return findCalcomBookingUidByAttendeeName(proposal.senderName)
}

function resolveRescheduleStart(task: BookingTaskPayload, proposal: AgentProposal): string | undefined {
  const fromTask = task.proposedTimes?.find((t) => t && t !== 'auto')
  if (fromTask) return fromTask

  const fromNotes = task.notes ? parseSchedulingTimeFromText(task.notes) : null
  if (fromNotes) return fromNotes

  return parseSchedulingTimeFromText(proposal.rawMessage) ?? undefined
}

async function executeBookingTask(
  proposal: AgentProposal,
  task: BookingTaskPayload,
  io?: SocketServer
): Promise<{ ok: boolean; message: string }> {
  if (task.action === 'book') {
    if (!task.inviteeEmails.length) {
      return { ok: false, message: 'Invitee email unresolved — add email and re-approve' }
    }
    const compose = task.composeCommand ?? bookingTaskToComposeCommand(task)
    const body = compose.replace(/^@(?:calcom|cal)\s+book\s*:?\s+/i, '')
    const input = parseCalcomBookBody(body)
    if (!input.start && task.proposedTimes?.[0] && task.proposedTimes[0] !== 'auto') {
      input.start = task.proposedTimes[0]
    }
    const result = await createCalcomBooking(input)
    if (result.ok) void syncCalcom(io).catch(() => undefined)
    return result
  }

  if (task.action === 'reschedule') {
    const bookingUid = await resolveBookingUid(task, proposal)
    if (!bookingUid) {
      return {
        ok: false,
        message: 'Original booking not found — sync Cal.com or set booking UID on approve'
      }
    }
    const start = resolveRescheduleStart(task, proposal)
    if (!start) {
      return {
        ok: false,
        message: 'New time not parsed — add proposed time (e.g. Friday 2pm) and re-approve'
      }
    }
    const result = await rescheduleCalcomBooking({
      bookingUid,
      start,
      reschedulingReason: task.notes
    })
    if (result.ok) void syncCalcom(io).catch(() => undefined)
    return result
  }

  if (task.action === 'cancel') {
    const bookingUid = await resolveBookingUid(task, proposal)
    if (!bookingUid) {
      return {
        ok: false,
        message: 'Booking UID not found — sync Cal.com or set UID on approve'
      }
    }
    const result = await cancelCalcomBooking({
      bookingUid,
      cancellationReason: task.notes
    })
    if (result.ok) void syncCalcom(io).catch(() => undefined)
    return result
  }

  return { ok: false, message: `Unknown booking action: ${task.action}` }
}

export async function executeApprovedProposal(
  proposal: AgentProposal,
  opts: { skipBooking?: boolean },
  io?: SocketServer
): Promise<AgentProposal> {
  const now = Date.now()
  const log: NonNullable<AgentProposal['executionLog']> = {}

  if (!opts.skipBooking && proposal.bookingTask) {
    try {
      const result = await executeBookingTask(proposal, proposal.bookingTask, io)
      log.booking = { ok: result.ok, message: result.message }
      logInteraction(
        proposal.id,
        result.ok ? 'booking_executed' : 'booking_failed',
        log.booking
      )
      if (!result.ok) proposal.status = 'partial'
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.booking = { ok: false, message }
      logInteraction(proposal.id, 'booking_failed', log.booking)
      proposal.status = 'partial'
    }
  }

  log.linkedinReply = {
    text: proposal.linkedinReplyDraft,
    sent: false
  }
  logInteraction(proposal.id, 'linkedin_reply_ready', log.linkedinReply)

  proposal.executionLog = log
  proposal.executedAt = now
  proposal.updatedAt = now
  if (proposal.status === 'approved') {
    proposal.status = log.booking && !log.booking.ok ? 'partial' : 'executed'
  }

  emitServerEvent(
    'agent_proposal_approved',
    {
      proposalId: proposal.id,
      intent: proposal.intent,
      bookingOk: log.booking?.ok,
      linkedinReplyReady: true
    },
    { subjectType: 'agent_proposal', subjectId: proposal.id, surface: 'linkedin' }
  )

  return proposal
}
