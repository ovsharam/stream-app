import type { BookingTaskPayload, InviteeResolution, LinkedInIngestInput } from '../../shared/agent-proposal'
import { findCalcomBookingsForAttendeeName } from './bookingContext'
import { getRecentItems } from '../db'
import { listContacts } from '../sources/contactsStore'

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi

function emailsInText(text: string): string[] {
  return [...new Set([...text.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase()))]
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

export async function resolveInvitee(input: LinkedInIngestInput): Promise<InviteeResolution> {
  const fromMessage = emailsInText(input.message)
  if (fromMessage.length > 0) {
    return { emails: fromMessage, method: 'message', confidence: 0.95 }
  }

  const calcomMatches = await findCalcomBookingsForAttendeeName(input.senderName)
  const best = calcomMatches.find((b) => {
    const start = new Date(b.startTime).getTime()
    return start >= Date.now() - 86_400_000
  }) ?? calcomMatches[0]

  if (best) {
    const when = new Date(best.startTime).toLocaleString()
    return {
      emails: best.attendeeEmail ? [best.attendeeEmail.toLowerCase()] : [],
      method: 'calcom_booking',
      confidence: best.attendeeEmail ? 0.88 : 0.8,
      bookingUid: best.bookingUid,
      note: `Matched Cal.com booking (${best.source}): ${best.title ?? 'meeting'} · ${when}`
    }
  }

  const calcomItems = getRecentItems(80, 'calcom')
  const tokens = nameTokens(input.senderName)
  for (const item of calcomItems) {
    const hay = `${item.title} ${item.body} ${item.metadata?.attendeeName ?? ''}`.toLowerCase()
    if (!tokens.every((t) => hay.includes(t))) continue
    const attendee = String(item.metadata?.attendeeEmail ?? '').toLowerCase()
    return {
      emails: attendee ? [attendee] : [],
      method: 'calcom_booking',
      confidence: attendee ? 0.75 : 0.65,
      bookingUid: String(item.metadata?.bookingUid ?? ''),
      note: 'Matched Cal.com stream item by sender name'
    }
  }

  try {
    const contacts = listContacts()
    const tokens = nameTokens(input.senderName)
    const match = contacts.find((c) => {
      const cn = c.name.toLowerCase()
      return tokens.length > 0 && tokens.every((t) => cn.includes(t))
    })
    if (match?.email) {
      return {
        emails: [match.email.toLowerCase()],
        method: 'contacts',
        confidence: 0.7,
        contactId: match.id,
        note: `Matched Google contact: ${match.name}`
      }
    }
  } catch {
    /* contacts optional */
  }

  return {
    emails: [],
    method: 'unresolved',
    confidence: 0,
    note: 'Add invitee email in approval step — LinkedIn messages rarely include email'
  }
}

export function bookingTaskToComposeCommand(task: BookingTaskPayload): string {
  const notes = task.notes ?? `LinkedIn thread ${task.sourceThreadId}`

  if (task.action === 'cancel') {
    const uid = task.originalBookingUid ?? 'unknown'
    return `@calcom cancel: ${uid} / ${notes}`
  }

  if (task.action === 'reschedule') {
    const uid = task.originalBookingUid ?? 'unknown'
    const start = task.proposedTimes?.[0] ?? 'auto'
    return `@calcom reschedule: ${uid} / ${start} / ${notes}`
  }

  const slug = task.eventTypeSlug ?? process.env.CALCOM_DEFAULT_EVENT_TYPE_SLUG ?? '30min'
  const email = task.inviteeEmails[0]
  if (!email) {
    throw new Error('Invitee email required for Cal.com booking')
  }
  const name = task.inviteeName ?? email.split('@')[0]
  const start = task.proposedTimes?.[0] ?? 'auto'
  return `@calcom book: ${slug} / ${email} / ${name} / ${start} / ${notes}`
}
