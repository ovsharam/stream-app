import { randomUUID } from 'crypto'
import { google } from 'googleapis'
import type { Server as SocketServer } from 'socket.io'
import { calendarEnabledAccounts, type GmailAccountRecord } from './gmailAccounts'
import { authClientForTokens, GOOGLE_REQUEST_OPTS } from './googleOAuth'
import { parseSchedulingTimeFromText, parseTimeZoneFromText } from './calcom'
import { expandMentionsWithContacts, listContacts } from './contactsStore'
import type { PlatformContact } from '../../shared/contacts'
import { invalidateCalendarCache } from './calendar'
import { assertGoogleApiAllowed, markGoogleRateLimited } from './googleRateLimit'

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi

export type MeetScheduleInput = {
  title: string
  start: string
  end: string
  timeZone: string
  attendees: Array<{ email: string; name?: string }>
}

export type MeetScheduleResult = {
  ok: boolean
  message: string
  eventId?: string
  meetLink?: string
  htmlLink?: string
}

function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Guest'
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function stripSchedulingNoise(text: string): string {
  return text
    .replace(/guests?\s+(are|include|includes|:)/gi, ' ')
    .replace(/\bincluding\b/gi, ' ')
    .replace(/\b(with|and|plus|for)\b/gi, ' ')
    .replace(/(^|[\s(,])@[a-z0-9_.-]+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ')
    .replace(/\b(?:about|re:|regarding)\s+.+$/i, ' ')
    .replace(/\b(?:schedule|set up|book|create|start|launch)\s+(?:a\s+)?(?:google\s+)?meet(?:ing)?\b/gi, ' ')
    .replace(/\bmeet(?:ing)?\s+with\b/gi, ' ')
    .replace(/\bon\s+google\s+meet\b/gi, ' ')
    .replace(/\b(?:right now|asap|immediately)\b/gi, ' ')
    .replace(/\bfor\s+\d+\s*(?:m|min|minutes|h|hr|hours?)\b/gi, ' ')
    .replace(/\b(pst|pdt|est|edt|cst|cdt|mst|mdt|utc|gmt|pacific|eastern|central|mountain)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDurationMinutes(text: string): number {
  const hours = text.match(/\bfor\s+(\d+)\s*(?:h|hr|hours?)\b/i)
  if (hours) return Math.max(15, Number(hours[1]) * 60)
  const mins = text.match(/\bfor\s+(\d+)\s*(?:m|min|minutes?)\b/i)
  if (mins) return Math.max(15, Number(mins[1]))
  const range = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  )
  if (range) {
    const startH = Number(range[1])
    const endH = Number(range[4])
    const startM = Number(range[2] ?? 0)
    const endM = Number(range[5] ?? 0)
    let endHour = endH
    const endMer = range[6] ?? range[3]
    if (endMer === 'pm' && endHour < 12) endHour += 12
    if (endMer === 'am' && endHour === 12) endHour = 0
    let startHour = startH
    const startMer = range[3] ?? range[6]
    if (startMer === 'pm' && startHour < 12) startHour += 12
    if (startMer === 'am' && startHour === 12) startHour = 0
    const diff = endHour * 60 + endM - (startHour * 60 + startM)
    if (diff > 0) return diff
  }
  return 30
}

function parseTitle(text: string, guestName: string): string {
  const about = text.match(/\b(?:about|re:|regarding)\s+(.+?)$/i)
  if (about?.[1]?.trim()) return about[1].trim().slice(0, 140)
  return `Meet with ${guestName}`
}

function contactForEmail(contacts: PlatformContact[], email: string): PlatformContact | undefined {
  const lower = email.toLowerCase()
  return contacts.find((c) => c.email.toLowerCase() === lower)
}

function attendeeFromContact(contact: PlatformContact): { email: string; name: string } {
  return {
    email: contact.email.toLowerCase(),
    name: contact.name.trim() || nameFromEmail(contact.email)
  }
}

function resolveAttendees(text: string, sessionId?: string): Array<{ email: string; name: string }> {
  const expanded = expandMentionsWithContacts(text.trim(), sessionId)
  const contacts = listContacts(sessionId)

  const fromText = [...expanded.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase())
  if (fromText.length > 0) {
    return [...new Set(fromText)].map((email) => {
      const contact = contactForEmail(contacts, email)
      return {
        email,
        name: contact?.name.trim() || nameFromEmail(email)
      }
    })
  }

  for (const contact of contacts) {
    if (!contact.email || !contact.mentionToken) continue
    if (new RegExp(`@${contact.mentionToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(expanded)) {
      return [attendeeFromContact(contact)]
    }
    const local = contact.email.split('@')[0]?.toLowerCase()
    if (local && new RegExp(`@${local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(expanded)) {
      return [attendeeFromContact(contact)]
    }
  }

  const lower = expanded.toLowerCase()
  for (const contact of contacts) {
    const cn = contact.name.trim().toLowerCase()
    if (cn && lower.includes(cn) && contact.email) {
      return [attendeeFromContact(contact)]
    }
  }
  for (const contact of contacts) {
    const tokens = nameTokens(contact.name)
    if (tokens.length > 0 && tokens.every((t) => lower.includes(t)) && contact.email) {
      return [attendeeFromContact(contact)]
    }
    const first = contact.name.split(/\s+/)[0]?.toLowerCase()
    if (first && first.length > 2 && new RegExp(`\\b${first}\\b`, 'i').test(expanded) && contact.email) {
      return [attendeeFromContact(contact)]
    }
    const local = contact.email.split('@')[0]?.toLowerCase()
    if (local && local.length > 2 && new RegExp(`\\b${local}\\b`, 'i').test(expanded) && contact.email) {
      return [attendeeFromContact(contact)]
    }
  }
  return []
}

export function parseMeetScheduleBody(body: string, sessionId?: string): MeetScheduleInput {
  const attendees = resolveAttendees(body, sessionId)
  if (attendees.length === 0) {
    throw new Error(
      'Name a guest — sync contacts in Apps → Gmail, then use @name (e.g. @meet with @nikhil tomorrow at 3pm).'
    )
  }

  const invalid = attendees.filter((a) => !isValidEmail(a.email))
  if (invalid.length > 0) {
    throw new Error(
      `Invalid guest email "${invalid[0].email}" — sync contacts in Apps → Gmail or paste a full address (name@domain.com).`
    )
  }

  const expanded = expandMentionsWithContacts(body.trim(), sessionId)

  let startIso: string | null = null
  if (/\b(right now|asap|immediately)\b/i.test(expanded)) {
    startIso = new Date().toISOString()
  } else {
    const whenText = stripSchedulingNoise(expanded)
    startIso = parseSchedulingTimeFromText(whenText || expanded)
  }
  if (!startIso) {
    throw new Error(
      'Could not parse date/time — try "@meet with @nikhil tomorrow at 3pm" or "schedule a meet with @martin June 10 2pm PST".'
    )
  }

  const durationMinutes = parseDurationMinutes(expanded)
  const start = new Date(startIso)
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const timeZone = parseTimeZoneFromText(expanded) ?? defaultTimeZone()
  const primaryGuest = attendees[0]

  return {
    title: parseTitle(expanded, primaryGuest.name),
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone,
    attendees
  }
}

function formatWhen(start: Date, timeZone: string): string {
  return start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone
  })
}

function guestEmailsOnEvent(
  attendees: Array<{ email?: string | null; organizer?: boolean | null }> | null | undefined,
  organizerEmail: string
): Set<string> {
  const out = new Set<string>()
  for (const a of attendees ?? []) {
    if (!a.email || a.organizer) continue
    if (a.email.toLowerCase() === organizerEmail) continue
    out.add(a.email.toLowerCase())
  }
  return out
}

function inviteMessage(
  guests: Array<{ email: string; name?: string }>,
  skippedOrganizer: boolean,
  emailed: boolean
): string {
  if (guests.length === 0) {
    return skippedOrganizer
      ? 'Meet created on your calendar (guest was your connected Gmail — Google does not email yourself).'
      : 'Meet created on your calendar.'
  }
  const emails = guests.map((g) => g.email).join(', ')
  const names = guests.map((g) => g.name?.trim() || nameFromEmail(g.email)).join(', ')
  if (emailed) {
    return `Calendar invite sent to ${names} (${emails}). Meet link also emailed.`
  }
  return `Calendar invite sent to ${names} (${emails})`
}

function encodeGmailRaw(lines: string[]): string {
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

async function emailMeetLinkToGuests(
  account: GmailAccountRecord,
  guests: Array<{ email: string; name?: string }>,
  input: MeetScheduleInput,
  meetLink: string | undefined,
  htmlLink: string | undefined
): Promise<{ sent: string[]; failed: string[] }> {
  const auth = authClientForTokens(account.tokens)
  const gmail = google.gmail({ version: 'v1', auth })
  const when = formatWhen(new Date(input.start), input.timeZone)
  const sent: string[] = []
  const failed: string[] = []

  for (const guest of guests) {
    const name = guest.name?.trim() || nameFromEmail(guest.email)
    const body = [
      `Hi ${name},`,
      '',
      `${account.email} scheduled a Google Meet with you.`,
      '',
      `Title: ${input.title}`,
      `When: ${when} (${input.timeZone})`,
      meetLink ? `Join Google Meet: ${meetLink}` : '',
      htmlLink ? `Add to calendar: ${htmlLink}` : '',
      '',
      '— Sent via Notch'
    ]
      .filter(Boolean)
      .join('\n')

    try {
      assertGoogleApiAllowed(`gmail.sendMeetInvite:${guest.email}`)
      await gmail.users.messages.send(
        {
          userId: 'me',
          requestBody: {
            raw: encodeGmailRaw([
              `To: ${guest.email}`,
              `Subject: Google Meet: ${input.title}`,
              'Content-Type: text/plain; charset=utf-8',
              '',
              body
            ])
          }
        },
        GOOGLE_REQUEST_OPTS
      )
      sent.push(guest.email)
    } catch (err) {
      markGoogleRateLimited(err, 'gmail.sendMeetInvite')
      failed.push(guest.email)
      console.warn('[meet] email invite failed for', guest.email, err)
    }
  }

  return { sent, failed }
}

export async function createGoogleMeetEvent(
  input: MeetScheduleInput,
  sessionId?: string,
  _io?: SocketServer
): Promise<MeetScheduleResult> {
  const accounts = await calendarEnabledAccounts(sessionId)
  if (accounts.length === 0) {
    return {
      ok: false,
      message: 'Connect Gmail with calendar enabled in Apps → Gmail, then try again.'
    }
  }

  const account = accounts[0]
  const organizerEmail = account.email.toLowerCase()
  const guestAttendees = input.attendees.filter((a) => a.email.toLowerCase() !== organizerEmail)
  const skippedOrganizer = guestAttendees.length < input.attendees.length

  if (guestAttendees.length === 0) {
    return {
      ok: false,
      message:
        'Guest email matches your connected Gmail — schedule with someone else, or paste their full email (name@domain.com).'
    }
  }

  assertGoogleApiAllowed(`calendar.createMeet:${account.email}`)

  const auth = authClientForTokens(account.tokens)
  const calendar = google.calendar({ version: 'v3', auth })

  const attendeePayload = guestAttendees.map((a) => ({
    email: a.email,
    displayName: a.name,
    responseStatus: 'needsAction' as const
  }))

  try {
    // Step 1: create Meet link first — Google often skips guest emails when both are set on insert.
    const res = await calendar.events.insert(
      {
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'none',
        requestBody: {
          summary: input.title,
          start: { dateTime: input.start, timeZone: input.timeZone },
          end: { dateTime: input.end, timeZone: input.timeZone },
          conferenceData: {
            createRequest: {
              requestId: randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          }
        }
      },
      GOOGLE_REQUEST_OPTS
    )

    const eventId = res.data.id
    if (!eventId) {
      return { ok: false, message: 'Google Calendar did not return an event id.' }
    }

    let event = res.data

    // Step 2: add guests in a separate call so sendUpdates reliably triggers invite emails.
    const patched = await calendar.events.patch(
      {
        calendarId: 'primary',
        eventId,
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          attendees: attendeePayload,
          guestsCanSeeOtherGuests: true
        }
      },
      GOOGLE_REQUEST_OPTS
    )
    event = patched.data

    const onCalendar = guestEmailsOnEvent(event.attendees, organizerEmail)
    const missingFromCalendar = guestAttendees.filter((g) => !onCalendar.has(g.email.toLowerCase()))
    if (missingFromCalendar.length > 0) {
      const retry = await calendar.events.patch(
        {
          calendarId: 'primary',
          eventId,
          conferenceDataVersion: 1,
          sendUpdates: 'all',
          requestBody: { attendees: attendeePayload }
        },
        GOOGLE_REQUEST_OPTS
      )
      event = retry.data
    }

    const meetLink =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
      undefined

    const htmlLink = event.htmlLink ?? undefined

    // Gmail backup — Calendar notifications are flaky when Meet conference is created in the same request.
    const emailResult = await emailMeetLinkToGuests(
      account,
      guestAttendees,
      input,
      meetLink,
      htmlLink
    )

    invalidateCalendarCache()

    const guestLabel = guestAttendees
      .map((a) => a.name?.trim() || nameFromEmail(a.email))
      .join(', ')
    const when = formatWhen(new Date(input.start), input.timeZone)
    const emailed = emailResult.sent.length > 0
    let inviteNote = inviteMessage(guestAttendees, skippedOrganizer, emailed)

    if (emailResult.failed.length > 0 && emailResult.sent.length === 0) {
      inviteNote = `Calendar invite sent to ${guestLabel} (${guestAttendees.map((g) => g.email).join(', ')}), but email delivery failed — share the Meet link manually.`
    } else if (emailResult.failed.length > 0) {
      inviteNote += ` Could not email: ${emailResult.failed.join(', ')}.`
    }

    const stillMissing = guestAttendees.filter(
      (g) => !guestEmailsOnEvent(event.attendees, organizerEmail).has(g.email.toLowerCase())
    )
    if (stillMissing.length > 0 && emailResult.sent.length === 0) {
      return {
        ok: false,
        message: `Meet created but could not add ${stillMissing[0].email} as a guest — reconnect Gmail in Apps, then retry.`
      }
    }

    const linkNote = meetLink ? ` · ${meetLink}` : ''

    return {
      ok: true,
      message: `Google Meet scheduled with ${guestLabel} · ${when}. ${inviteNote}.${linkNote}`,
      eventId,
      meetLink,
      htmlLink
    }
  } catch (err) {
    markGoogleRateLimited(err, 'calendar.createMeet')
    const raw = err instanceof Error ? err.message : String(err)
    if (/insufficient.*scope|403|Forbidden/i.test(raw)) {
      return {
        ok: false,
        message:
          'Calendar write access needed — disconnect Gmail in Apps, connect again (grants calendar events), then retry.'
      }
    }
    return { ok: false, message: raw.slice(0, 400) || 'Failed to create Google Calendar event' }
  }
}

export async function scheduleGoogleMeetFromText(
  body: string,
  sessionId?: string,
  io?: SocketServer
): Promise<MeetScheduleResult> {
  try {
    const input = parseMeetScheduleBody(body, sessionId)
    return createGoogleMeetEvent(input, sessionId, io)
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}
