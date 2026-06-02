/** Follow-up scheduling extracted from a call transcript. */
export type FollowUpMeetingIntent = {
  requested: boolean
  title?: string
  attendeeName?: string
  attendeeEmail?: string
  /** ISO-8601 UTC start, or omit / "auto" to pick next open slot */
  suggestedStart?: string
  eventTypeSlug?: string
  notes?: string
}

export function parseFollowUpMeeting(raw: unknown): FollowUpMeetingIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!o.requested) return null
  return {
    requested: true,
    title: o.title ? String(o.title).trim() : undefined,
    attendeeName: o.attendeeName ? String(o.attendeeName).trim() : undefined,
    attendeeEmail: o.attendeeEmail ? String(o.attendeeEmail).trim() : undefined,
    suggestedStart: o.suggestedStart ? String(o.suggestedStart).trim() : undefined,
    eventTypeSlug: o.eventTypeSlug ? String(o.eventTypeSlug).trim() : undefined,
    notes: o.notes ? String(o.notes).trim() : undefined
  }
}

export function transcriptMentionsScheduling(text: string): boolean {
  return /\b(schedule|book(?:ing)?|calendar|cal\.com|follow[- ]?up (?:call|meeting|sync)|next (?:call|meeting|sync)|set up (?:a )?(?:call|meeting)|grab time|find time)\b/i.test(
    text
  )
}

export function extractEmailFromText(text: string): string | undefined {
  const match = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  return match?.[0]?.toLowerCase()
}
