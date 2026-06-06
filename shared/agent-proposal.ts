/** Autonomous agent proposals — LinkedIn perception → intent → dual action drafts. */

export type AgentIntent =
  | 'schedule_new'
  | 'reschedule'
  | 'decline'
  | 'confirm'
  | 'info_request'
  | 'follow_up'
  | 'other'

export type AgentProposalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'partial'

export type InviteeResolution = {
  emails: string[]
  method: 'message' | 'contacts' | 'calcom_booking' | 'manual' | 'unresolved'
  confidence: number
  contactId?: string
  bookingUid?: string
  note?: string
}

export type BookingTaskPayload = {
  action: 'book' | 'reschedule' | 'cancel'
  inviteeEmails: string[]
  inviteeName?: string
  eventTypeSlug?: string
  durationMin?: number
  proposedTimes?: string[]
  originalBookingUid?: string
  notes?: string
  sourceThreadId: string
  confidence: number
  composeCommand?: string
  /** ISO start of matched Cal.com booking (may differ from proposed time). */
  matchedBookingStart?: string
  proposedTimeSource?: 'calcom' | 'calendar' | 'message'
}

export type AgentInteractionStage =
  | 'raw_message'
  | 'intent_classified'
  | 'invitee_resolved'
  | 'drafts_created'
  | 'booking_context'
  | 'context_built'
  | 'user_approved'
  | 'user_rejected'
  | 'booking_executed'
  | 'booking_failed'
  | 'linkedin_reply_ready'

export type AgentThreadMessage = {
  sender: 'self' | 'other'
  senderName?: string
  text: string
  ts?: number
}

export type AgentCalendarCheck = {
  proposedIso?: string
  timeLabel?: string
  isFree: boolean
  conflictingEvent?: string
}

export type AgentActionProvider =
  | 'calcom'
  | 'gmail'
  | 'monday'
  | 'contacts'
  | 'gdocs'
  | 'slack'

export type AgentActionProposal = {
  id: string
  provider: AgentActionProvider
  label: string
  description: string
  composeText: string
  /** Run with main Approve flow (e.g. Cal.com for scheduling). */
  primary?: boolean
  optional?: boolean
}

export type AgentBrief = {
  humanSummary: string
  suggestedAction?: string
  calendarCheck?: AgentCalendarCheck
  kbExcerpts?: string[]
  graphHits?: Array<{ title: string; subtitle?: string }>
}

export type AgentProposal = {
  id: string
  source: 'linkedin'
  threadId: string
  senderName: string
  senderProfileUrl?: string
  rawMessage: string
  intent: AgentIntent
  confidence: number
  linkedinReplyDraft: string
  bookingTask?: BookingTaskPayload
  inviteeResolution: InviteeResolution
  status: AgentProposalStatus
  createdAt: number
  updatedAt: number
  approvedAt?: number
  executedAt?: number
  executionLog?: {
    booking?: { ok: boolean; message: string }
    linkedinReply?: { text: string; sent: boolean }
  }
  brief?: AgentBrief
  threadMessages?: AgentThreadMessage[]
  actionProposals?: AgentActionProposal[]
}

export type LinkedInIngestInput = {
  threadId: string
  senderName: string
  senderProfileUrl?: string
  message: string
  detectedAt?: number
  threadMessages?: AgentThreadMessage[]
}

export type ApproveAgentProposalInput = {
  linkedinReply?: string
  bookingTask?: Partial<BookingTaskPayload>
  skipBooking?: boolean
}

function parseJsonRecord<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function parseAgentBriefMeta(
  meta: Record<string, unknown> | undefined
): { brief: AgentBrief; proposalId: string; status?: AgentProposalStatus } | null {
  if (!meta?.agentProposalId) return null

  const proposalId = String(meta.agentProposalId)
  const status = meta.agentProposalStatus
    ? (String(meta.agentProposalStatus) as AgentProposalStatus)
    : undefined

  let brief: AgentBrief | null = null
  if (meta.agentBrief && typeof meta.agentBrief === 'object' && !Array.isArray(meta.agentBrief)) {
    brief = meta.agentBrief as AgentBrief
  } else {
    brief = parseJsonRecord<AgentBrief>(meta.agentBrief)
  }

  if (!brief?.humanSummary) return null
  return { brief, proposalId, status }
}
