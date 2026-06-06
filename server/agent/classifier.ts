import type {
  AgentIntent,
  BookingTaskPayload,
  InviteeResolution,
  LinkedInIngestInput
} from '../../shared/agent-proposal'
import { isClaudeConnected, queryClaude } from '../sources/claude'

export type ClassifierResult = {
  intent: AgentIntent
  confidence: number
  linkedinReplyDraft: string
  bookingTask?: BookingTaskPayload
}

const SCHEDULE_RE = /\b(schedule|book|meeting|call|sync|catch up|calendar|slot|time|reschedule|move|push|tomorrow|next week|monday|tuesday|wednesday|thursday|friday)\b/i

function heuristicClassify(
  input: LinkedInIngestInput,
  invitee: InviteeResolution
): ClassifierResult {
  const lower = input.message.toLowerCase()
  let intent: AgentIntent = 'other'
  if (/\b(proposed a new time|reschedule|move|push|different time|another time)\b/i.test(lower)) {
    intent = 'reschedule'
  } else if (/\b(schedule|book|meeting|call|sync|calendar|slot)\b/i.test(lower)) {
    intent = 'schedule_new'
  } else if (/\b(decline|can't make|cannot make|pass on)\b/i.test(lower)) {
    intent = 'decline'
  } else if (/\b(confirm|works for me|sounds good|see you)\b/i.test(lower)) {
    intent = 'confirm'
  } else if (/\?\s*$/.test(input.message.trim()) || /\b(what|when|where|how)\b/i.test(lower)) {
    intent = 'info_request'
  }

  const needsBooking = intent === 'schedule_new' || intent === 'reschedule'
  const firstName = input.senderName.split(/\s+/)[0] ?? 'there'

  let linkedinReplyDraft = `Hi ${firstName} — thanks for reaching out. I'll follow up shortly.`
  if (intent === 'schedule_new') {
    linkedinReplyDraft = `Hi ${firstName} — happy to find time. I'll send a calendar invite shortly with a few options that work on my end.`
  } else if (intent === 'reschedule') {
    linkedinReplyDraft = `Hi ${firstName} — no problem, we can move this. I'll send updated times shortly.`
  }

  let bookingTask: BookingTaskPayload | undefined
  if (needsBooking && (invitee.emails.length > 0 || intent === 'reschedule')) {
    bookingTask = {
      action: intent === 'reschedule' ? 'reschedule' : 'book',
      inviteeEmails: invitee.emails,
      inviteeName: input.senderName,
      eventTypeSlug: process.env.CALCOM_DEFAULT_EVENT_TYPE_SLUG ?? '30min',
      durationMin: 30,
      proposedTimes: [],
      originalBookingUid: intent === 'reschedule' ? invitee.bookingUid : undefined,
      notes: `LinkedIn: ${input.message.slice(0, 200)}`,
      sourceThreadId: input.threadId,
      confidence: invitee.confidence * 0.8
    }
  }

  return {
    intent,
    confidence: needsBooking ? 0.55 : 0.45,
    linkedinReplyDraft,
    bookingTask
  }
}

const CLASSIFIER_PROMPT = `You classify LinkedIn messages for an FDE operator and produce TWO drafts:
1) linkedinReplyDraft — professional reply (do NOT send, human approves)
2) bookingTask — only if scheduling/rescheduling is needed

Output JSON only:
{
  "intent": "schedule_new|reschedule|decline|confirm|info_request|follow_up|other",
  "confidence": 0.0-1.0,
  "linkedinReplyDraft": "string",
  "bookingTask": null | {
    "action": "book|reschedule|cancel",
    "inviteeEmails": ["email@..."],
    "inviteeName": "string",
    "eventTypeSlug": "30min",
    "durationMin": 30,
    "proposedTimes": ["ISO8601"],
    "originalBookingUid": null,
    "notes": "string",
    "sourceThreadId": "string",
    "confidence": 0.0-1.0
  }
}

Rules:
- Never invent emails — use inviteeEmails from RESOLVED_INVITEE only, or [] if unresolved
- For reschedule (including "proposed a new time"), set action reschedule even if the message also says "works for me"
- Keep reply concise and human`

function parseClassifierJson(text: string): ClassifierResult | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as ClassifierResult
    if (!parsed.linkedinReplyDraft || !parsed.intent) return null
    return parsed
  } catch {
    return null
  }
}

export async function classifyLinkedInMessage(
  input: LinkedInIngestInput,
  invitee: InviteeResolution
): Promise<ClassifierResult> {
  if (!isClaudeConnected() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    return heuristicClassify(input, invitee)
  }

  const userBlock = `SENDER: ${input.senderName}
THREAD_ID: ${input.threadId}
RESOLVED_INVITEE: ${JSON.stringify(invitee)}
MESSAGE:
${input.message}`

  try {
    const item = await queryClaude(userBlock, CLASSIFIER_PROMPT)
    const raw = item.bodyFull ?? item.body
    const parsed = parseClassifierJson(raw)
    if (parsed) {
      if (parsed.bookingTask) {
        parsed.bookingTask.sourceThreadId = input.threadId
        if (invitee.emails.length > 0) {
          parsed.bookingTask.inviteeEmails = invitee.emails
        }
      }
      return parsed
    }
  } catch (err) {
    console.warn('[agent] classifier fallback:', err instanceof Error ? err.message : err)
  }

  return heuristicClassify(input, invitee)
}

export function messageLooksActionable(text: string): boolean {
  return SCHEDULE_RE.test(text) || text.trim().length > 12
}
