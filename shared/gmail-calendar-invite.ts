export type GmailCalendarInviteRsvp = 'yes' | 'maybe' | 'no'

export type GmailCalendarInvite = {
  eventTitle?: string
  whenLabel?: string
  where?: string
  who?: string
  timezone?: string
  recipientEmail?: string
  calendarUrl?: string
  gmailUrl?: string
  startAt?: number
  monthAbbr?: string
  dayNumber?: number
  weekday?: string
  inviteKind?: 'invitation' | 'updated' | 'canceled'
  rsvpUrls?: Partial<Record<GmailCalendarInviteRsvp, string>>
}

const INVITE_SUBJECT_RE =
  /^(Invitation(?: from an unknown sender)?|Updated invitation|Canceled event(?: notification)?):/i

const INVITE_PREFIX_RE =
  /^(Invitation(?: from an unknown sender)?|Updated invitation|Canceled event(?: notification)?):\s*/i

export function isGmailCalendarInviteSubject(subject: string): boolean {
  return INVITE_SUBJECT_RE.test(subject.trim())
}

function inviteKindFromSubject(subject: string): GmailCalendarInvite['inviteKind'] {
  const s = subject.trim()
  if (/^Canceled event/i.test(s)) return 'canceled'
  if (/^Updated invitation/i.test(s)) return 'updated'
  return 'invitation'
}

function enrichDateParts(invite: Partial<GmailCalendarInvite>): Partial<GmailCalendarInvite> {
  const startAt = invite.startAt ?? (invite.whenLabel ? parseInviteStartAt(invite.whenLabel) : undefined)
  if (!startAt) return { ...invite, startAt }
  const parts = inviteDateParts(startAt)
  return { ...invite, startAt, ...parts }
}

function normalizeWhenForParse(when: string): string {
  return when
    .replace(/\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi, (_, h, m, ap) => {
      const mins = m ? `:${m}` : ':00'
      return ` ${h}${mins} ${String(ap).toUpperCase()}`
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseInviteStartAt(whenLabel: string): number | undefined {
  const startPart = whenLabel.split(/\s*[-–—]\s*/)[0]?.trim() ?? whenLabel
  const cleaned = normalizeWhenForParse(startPart.replace(/\s*\([^)]+\)\s*$/, '').trim())
  const ts = Date.parse(cleaned)
  return Number.isFinite(ts) ? ts : undefined
}

export function inviteDateParts(startAt: number): {
  monthAbbr: string
  dayNumber: number
  weekday: string
} {
  const d = new Date(startAt)
  return {
    monthAbbr: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    dayNumber: d.getDate(),
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' })
  }
}

export function parseGmailCalendarInviteFromSubject(subject: string): Partial<GmailCalendarInvite> {
  const trimmed = subject.trim()
  if (!isGmailCalendarInviteSubject(trimmed)) return {}

  const inviteKind = inviteKindFromSubject(trimmed)
  const rest = trimmed.replace(INVITE_PREFIX_RE, '').trim()
  const atIdx = rest.indexOf(' @ ')
  if (atIdx < 0) {
    return enrichDateParts({ eventTitle: rest, inviteKind })
  }

  const eventTitle = rest.slice(0, atIdx).trim()
  let tail = rest.slice(atIdx + 3).trim()

  let recipientEmail: string | undefined
  const emailMatch = tail.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)\s*$/)
  if (emailMatch) {
    recipientEmail = emailMatch[1]
    tail = tail.slice(0, emailMatch.index).trim()
  }

  let timezone: string | undefined
  const tzMatch = tail.match(/\(([^)]+)\)\s*$/)
  if (tzMatch) {
    timezone = tzMatch[1]?.trim()
    tail = tail.slice(0, tzMatch.index).trim()
  }

  const whenLabel = tail.trim()
  return enrichDateParts({ eventTitle, whenLabel, timezone, recipientEmail, inviteKind })
}

function textWithLinksFromHtml(html: string): string {
  return html
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 $1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractCalendarUrls(text: string): string[] {
  const urls: string[] = []
  const re = /https:\/\/calendar\.google\.com\/[^\s)\]"'<>]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    urls.push(m[0].replace(/[.,;]+$/, ''))
  }
  return urls
}

function classifyRsvpUrl(url: string): GmailCalendarInviteRsvp | null {
  const lower = url.toLowerCase()
  if (/action=decline|rsvp=decline|rst=3(?!\d)/.test(lower)) return 'no'
  if (/action=tentative|rsvp=tentative|rst=2(?!\d)/.test(lower)) return 'maybe'
  if (/action=respond|rst=1(?!\d)|rsvp=accept|action=accept/.test(lower)) return 'yes'
  return null
}

function parseRsvpUrls(text: string): Partial<Record<GmailCalendarInviteRsvp, string>> {
  const urls = extractCalendarUrls(text)
  const out: Partial<Record<GmailCalendarInviteRsvp, string>> = {}
  for (const url of urls) {
    const kind = classifyRsvpUrl(url)
    if (kind && !out[kind]) out[kind] = url
  }
  return out
}

function parseLabelSection(text: string, label: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)${label}\\s*\\n+([^\\n]+(?:\\n(?!(?:When|Where|Who|View|Join|Reply)[\\s\\n]|https?:)[^\\n]+)*)`, 'i')
  const m = text.match(re)
  return m?.[1]?.replace(/\s+/g, ' ').trim() || undefined
}

export function parseGmailCalendarInviteFromBody(body: string): Partial<GmailCalendarInvite> {
  if (!body.trim()) return {}

  const text = body.includes('<') ? textWithLinksFromHtml(body) : body.replace(/\r\n/g, '\n')
  const out: Partial<GmailCalendarInvite> = {}

  const calUrls = extractCalendarUrls(text)
  const viewUrl = calUrls.find((u) => /action=view|eid=/i.test(u) && !classifyRsvpUrl(u))
  if (viewUrl) out.calendarUrl = viewUrl
  else if (calUrls[0] && !classifyRsvpUrl(calUrls[0])) out.calendarUrl = calUrls[0]

  const rsvpUrls = parseRsvpUrls(text)
  if (Object.keys(rsvpUrls).length > 0) out.rsvpUrls = rsvpUrls

  const when = parseLabelSection(text, 'When')
  const where = parseLabelSection(text, 'Where')
  const who = parseLabelSection(text, 'Who')
  if (when) out.whenLabel = when
  if (where) out.where = where
  if (who) out.who = who

  return enrichDateParts(out)
}

export function parseGmailCalendarInviteFromIcs(ics: string): Partial<GmailCalendarInvite> {
  if (!ics.includes('BEGIN:VEVENT')) return {}

  const unfolded: string[] = []
  for (const line of ics.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1)
    } else {
      unfolded.push(line)
    }
  }

  const fields: Record<string, string> = {}
  for (const line of unfolded) {
    if (!line.includes(':')) continue
    const idx = line.indexOf(':')
    const key = line.slice(0, idx).split(';')[0]?.toUpperCase() ?? ''
    const value = line.slice(idx + 1).trim()
    if (key) fields[key] = value
  }

  const out: Partial<GmailCalendarInvite> = {}
  if (fields.SUMMARY) out.eventTitle = fields.SUMMARY.replace(/\\,/g, ',').replace(/\\n/g, ' ')
  if (fields.LOCATION) out.where = fields.LOCATION.replace(/\\,/g, ',').replace(/\\n/g, ' ')

  const organizer = fields.ORGANIZER
  if (organizer) {
    const mailMatch = organizer.match(/mailto:([^;\s]+)/i)
    const cnMatch = organizer.match(/CN=([^;:]+)/i)
    out.who = cnMatch?.[1]?.replace(/\\,/g, ',').trim() || mailMatch?.[1]
  }

  const dtStartRaw = fields.DTSTART
  if (dtStartRaw) {
    const parsed = parseIcsDate(dtStartRaw)
    if (parsed) {
      out.startAt = parsed.getTime()
      Object.assign(out, inviteDateParts(parsed.getTime()))
    }
  }

  return out
}

function parseIcsDate(raw: string): Date | null {
  const compact = raw.replace(/[^0-9TZtz]/g, '')
  if (/^\d{8}T\d{6}Z?$/i.test(compact)) {
    const y = parseInt(compact.slice(0, 4), 10)
    const mo = parseInt(compact.slice(4, 6), 10) - 1
    const d = parseInt(compact.slice(6, 8), 10)
    const h = parseInt(compact.slice(9, 11), 10)
    const mi = parseInt(compact.slice(11, 13), 10)
    const s = parseInt(compact.slice(13, 15), 10)
    const utc = /z$/i.test(compact)
    return utc ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s)
  }
  if (/^\d{8}$/.test(compact)) {
    const y = parseInt(compact.slice(0, 4), 10)
    const mo = parseInt(compact.slice(4, 6), 10) - 1
    const d = parseInt(compact.slice(6, 8), 10)
    return new Date(y, mo, d)
  }
  return null
}

export function mergeGmailCalendarInvite(
  ...parts: Partial<GmailCalendarInvite>[]
): Partial<GmailCalendarInvite> {
  const merged: Partial<GmailCalendarInvite> = {}
  for (const part of parts) {
    Object.assign(merged, part)
    if (part.rsvpUrls) {
      merged.rsvpUrls = { ...merged.rsvpUrls, ...part.rsvpUrls }
    }
  }
  return enrichDateParts(merged)
}

export function isSameCalendarDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}
