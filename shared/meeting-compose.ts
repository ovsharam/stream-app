/** Natural-language Google Meet scheduling (compose + Home chat). */

import { parseComposeCommand, type ComposeCommand } from './compose'

const MEET_PROVIDER_RE = /^@(?:meet|gmeet|googlemeet)\b/i
const MEET_NLP_RE =
  /\b(?:schedule|set up|book|create|start|launch|kick off)\s+(?:a\s+)?(?:google\s+)?meet(?:ing)?\b/i
const MEET_WITH_RE = /\bmeet(?:ing)?\s+with\b/i
const ON_GOOGLE_MEET_RE = /\bon\s+google\s+meet\b/i
const RIGHT_NOW_RE = /\b(?:right now|asap|immediately)\b/i
const TIME_HINT_RE =
  /\b(today|tomorrow|now|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|\d{1,2}(?::\d{2})?\s*(?:am|pm)|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
const MENTION_OR_EMAIL_RE = /(^|[\s(,])@([a-z0-9_.-]+)|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i

export function looksLikeMeetSchedule(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (MEET_PROVIDER_RE.test(t)) return true
  if (MEET_NLP_RE.test(t) && MENTION_OR_EMAIL_RE.test(t)) return true
  if (MEET_WITH_RE.test(t) && (TIME_HINT_RE.test(t) || RIGHT_NOW_RE.test(t))) return true
  if (ON_GOOGLE_MEET_RE.test(t) && MEET_WITH_RE.test(t)) return true
  if (MEET_NLP_RE.test(t) && ON_GOOGLE_MEET_RE.test(t)) return true
  return false
}

export function toMeetComposeCommand(text: string): string {
  const t = text.trim()
  if (MEET_PROVIDER_RE.test(t)) return t
  const stripped = t.replace(/^(please\s+)?(can you\s+)?/i, '').trim()
  return `@meet ${stripped}`
}

/** Feed/Home compose: treat NLP meet requests like @meet commands. */
export function composeActionFromText(text: string): ComposeCommand | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parsed = parseComposeCommand(trimmed)
  if (parsed) return parsed
  if (!looksLikeMeetSchedule(trimmed)) return null
  const cmd = toMeetComposeCommand(trimmed)
  return parseComposeCommand(cmd) ?? {
    provider: 'meet',
    intent: 'schedule',
    body: trimmed,
    raw: cmd
  }
}

export function meetActionTextForSubmit(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  if (parseComposeCommand(trimmed)) return trimmed
  if (looksLikeMeetSchedule(trimmed)) return toMeetComposeCommand(trimmed)
  return trimmed
}
