import type { StreamItem } from '../../shared/types'
import type { BookingTaskPayload, InviteeResolution } from '../../shared/agent-proposal'
import {
  fetchCalcomBookings,
  isCalcomConnected,
  parseSchedulingTimeFromText,
  syncCalcom
} from '../sources/calcom'
import { getRecentItems } from '../db'
import { getMergedCalendarRailEvents } from '../sources/calendar'

export type MatchedBooking = {
  bookingUid: string
  attendeeEmail?: string
  attendeeName?: string
  startTime: string
  endTime?: string
  status?: string
  title?: string
  source: 'calcom_cache' | 'calcom_api'
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function haystackForItem(item: StreamItem): string {
  const attendeeName = String(item.metadata?.attendeeName ?? '')
  return `${item.title} ${item.body} ${item.bodyFull} ${item.metadata?.attendeeEmail} ${attendeeName}`.toLowerCase()
}

function itemMatchesName(item: StreamItem, senderName: string): boolean {
  if (item.source !== 'calcom') return false
  const tokens = nameTokens(senderName)
  if (!tokens.length) return false
  const hay = haystackForItem(item)
  return tokens.every((t) => hay.includes(t))
}

function itemToMatch(item: StreamItem, source: MatchedBooking['source']): MatchedBooking | null {
  const bookingUid = String(item.metadata?.bookingUid ?? item.id.replace(/^calcom-/, '')).trim()
  const startTime = String(item.metadata?.startTime ?? '')
  if (!bookingUid || !startTime) return null
  const attendeeName = String(item.metadata?.attendeeName ?? '').trim()
  return {
    bookingUid,
    attendeeEmail: item.metadata?.attendeeEmail ? String(item.metadata.attendeeEmail) : undefined,
    attendeeName: attendeeName || undefined,
    startTime,
    endTime: item.metadata?.endTime ? String(item.metadata.endTime) : undefined,
    status: item.metadata?.status ? String(item.metadata.status) : undefined,
    title: item.title,
    source
  }
}

export async function findCalcomBookingsForAttendeeName(senderName: string): Promise<MatchedBooking[]> {
  const matches: MatchedBooking[] = []
  const seen = new Set<string>()

  for (const item of getRecentItems(120, 'calcom')) {
    if (!itemMatchesName(item, senderName)) continue
    const match = itemToMatch(item, 'calcom_cache')
    if (match && !seen.has(match.bookingUid)) {
      seen.add(match.bookingUid)
      matches.push(match)
    }
  }

  if (isCalcomConnected()) {
    try {
      for (const item of await fetchCalcomBookings(50)) {
        if (!itemMatchesName(item, senderName)) continue
        const match = itemToMatch(item, 'calcom_api')
        if (match && !seen.has(match.bookingUid)) {
          seen.add(match.bookingUid)
          matches.push(match)
        }
      }
    } catch {
      /* optional live lookup */
    }
  }

  const now = Date.now()
  return matches.sort((a, b) => {
    const aFuture = new Date(a.startTime).getTime() >= now ? 0 : 1
    const bFuture = new Date(b.startTime).getTime() >= now ? 0 : 1
    if (aFuture !== bFuture) return aFuture - bFuture
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  })
}

/** Dates mentioned as the *original* booking, not the new proposal. */
export function extractOriginalBookingMention(message: string): Date | null {
  const patterns = [
    /\b(?:booked|scheduled|set|was)\s+for\s+([^.,!\n]+)/i,
    /\b(?:original(?:ly)?|originally)\s+(?:on|for)\s+([^.,!\n]+)/i
  ]
  for (const re of patterns) {
    const m = message.match(re)
    if (m?.[1]) {
      const parsed = parseSchedulingTimeFromText(m[1])
      if (parsed) return new Date(parsed)
    }
  }
  return null
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function extractExplicitProposedTime(message: string, exclude?: Date | null): string | null {
  const patterns = [
    /\b(?:proposed|suggested|move(?:d)?\s+to|reschedule(?:d)?\s+(?:to|for)|new time(?:\s+is)?)\s+([^.,!\n]+)/i
  ]
  for (const re of patterns) {
    const m = message.match(re)
    if (!m?.[1]) continue
    const fragment = m[1].replace(/\b(a|the)\s+new\s+time\b/i, '').trim()
    if (!fragment || /^(a|the)\s*$/i.test(fragment)) continue
    const parsed = parseSchedulingTimeFromText(fragment)
    if (!parsed) continue
    const dt = new Date(parsed)
    if (exclude && sameLocalDay(dt, exclude)) continue
    return parsed
  }
  return null
}

function calendarEventsForName(senderName: string) {
  const tokens = nameTokens(senderName)
  if (!tokens.length) return []
  const now = Date.now()
  return getMergedCalendarRailEvents().filter((evt) => {
    if (evt.endsAt < now - 86_400_000) return false
    const hay = evt.title.toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

export type RescheduleEnrichment = {
  invitee: InviteeResolution
  task: BookingTaskPayload
  context: {
    matchedBooking?: MatchedBooking
    proposedTimeSource?: 'calcom' | 'calendar' | 'message'
    originalMention?: string
  }
}

export async function enrichRescheduleBooking(
  senderName: string,
  message: string,
  task: BookingTaskPayload,
  invitee: InviteeResolution
): Promise<RescheduleEnrichment> {
  if (isCalcomConnected()) {
    try {
      await syncCalcom()
    } catch {
      /* continue with cache */
    }
  }

  const bookings = await findCalcomBookingsForAttendeeName(senderName)
  const originalMention = extractOriginalBookingMention(message)
  const now = Date.now()

  let matched = bookings.find((b) => {
    const start = new Date(b.startTime).getTime()
    return start >= now - 86_400_000
  }) ?? bookings[0]

  let nextInvitee = { ...invitee }
  if (matched) {
    if (matched.attendeeEmail && !nextInvitee.emails.length) {
      nextInvitee = {
        emails: [matched.attendeeEmail.toLowerCase()],
        method: 'calcom_booking',
        confidence: 0.85,
        bookingUid: matched.bookingUid,
        note: `Matched Cal.com booking: ${matched.title ?? 'meeting'} · ${new Date(matched.startTime).toLocaleString()}`
      }
    } else if (!nextInvitee.bookingUid) {
      nextInvitee = {
        ...nextInvitee,
        bookingUid: matched.bookingUid,
        note: nextInvitee.note
          ? `${nextInvitee.note} · UID ${matched.bookingUid}`
          : `Matched Cal.com booking · ${new Date(matched.startTime).toLocaleString()}`
      }
    }
  }

  let nextTask = { ...task }
  if (matched?.bookingUid && !nextTask.originalBookingUid) {
    nextTask.originalBookingUid = matched.bookingUid
  }
  if (matched?.attendeeEmail && !nextTask.inviteeEmails.length) {
    nextTask.inviteeEmails = [matched.attendeeEmail]
    nextTask.inviteeName = matched.attendeeName ?? senderName
  }

  let proposedTime: string | undefined
  let proposedTimeSource: RescheduleEnrichment['context']['proposedTimeSource']

  const explicit = extractExplicitProposedTime(message, originalMention)
  if (explicit) {
    proposedTime = explicit
    proposedTimeSource = 'message'
  }

  if (!proposedTime && matched) {
    const start = new Date(matched.startTime)
    const isOriginal =
      originalMention != null && sameLocalDay(start, originalMention)
    if (!isOriginal && start.getTime() >= now - 3_600_000) {
      proposedTime = matched.startTime
      proposedTimeSource = 'calcom'
    }
  }

  if (!proposedTime) {
    const calEvents = calendarEventsForName(senderName)
    for (const evt of calEvents.sort((a, b) => a.startsAt - b.startsAt)) {
      if (evt.startsAt < now - 3_600_000) continue
      const start = new Date(evt.startsAt)
      if (originalMention && sameLocalDay(start, originalMention)) continue
      proposedTime = start.toISOString()
      proposedTimeSource = 'calendar'
      break
    }
  }

  if (proposedTime) {
    nextTask.proposedTimes = [proposedTime]
    nextTask.proposedTimeSource = proposedTimeSource
  }
  if (matched?.startTime) {
    nextTask.matchedBookingStart = matched.startTime
  } else if (originalMention) {
    nextTask.notes = [task.notes, `Original booking: ${originalMention.toLocaleDateString()}. New time not in Cal.com/calendar yet.`]
      .filter(Boolean)
      .join(' · ')
  }

  return {
    invitee: nextInvitee,
    task: nextTask,
    context: {
      matchedBooking: matched,
      proposedTimeSource,
      originalMention: originalMention?.toISOString()
    }
  }
}

export async function findCalcomBookingUidByAttendeeName(name: string): Promise<string | undefined> {
  const bookings = await findCalcomBookingsForAttendeeName(name)
  return bookings[0]?.bookingUid
}
