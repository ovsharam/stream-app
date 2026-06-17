import { google } from 'googleapis'
import type { CalendarRailEvent } from '../../shared/cluster'
import { authClientForTokens, isGoogleConnected, GOOGLE_REQUEST_OPTS } from './googleOAuth'
import { calendarEnabledAccounts, type GmailAccountRecord } from './gmailAccounts'
import { getNested, setNested } from '../store'
import type { GoogleCalendarOption } from '../../shared/cluster'
import {
  googleApiBlockedMessage,
  isGoogleApiBlocked,
  markGoogleRateLimited,
  effectiveGoogleSyncError,
  assertGoogleApiAllowed
} from './googleRateLimit'

/** Server-side cache TTL — clients may poll often; avoid hitting Google every request. */
export const CALENDAR_CACHE_MS = 5 * 60_000

let cachedEvents: CalendarRailEvent[] = []
let cachedAt = 0
let cachedCalendarOptions: GoogleCalendarOption[] = []
let cachedCalendarOptionsAt = 0
let lastCalendarError: string | null = null

export function clearLastCalendarError(): void {
  lastCalendarError = null
}

export function invalidateCalendarCache(): void {
  cachedAt = 0
}

const COMPOSITE_SEP = '::'

/** Today + next 13 days (2-week rail horizon; Cal.com may show further). */
const CALENDAR_RAIL_DAYS = 14
const MAX_UPCOMING_PER_DAY = 4
/** Ended meetings kept visible for today only */
const MAX_PAST_TODAY = 6

export function compositeCalendarId(accountId: string, googleCalendarId: string): string {
  return `${accountId}${COMPOSITE_SEP}${googleCalendarId}`
}

function parseCompositeCalendarId(id: string): { accountId: string; calendarId: string } {
  const idx = id.indexOf(COMPOSITE_SEP)
  if (idx === -1) return { accountId: '', calendarId: id }
  return {
    accountId: id.slice(0, idx),
    calendarId: id.slice(idx + COMPOSITE_SEP.length)
  }
}

function eventPriority(evt: CalendarRailEvent): number {
  if (evt.live) return 0
  const durationMins = (evt.endsAt - evt.startsAt) / 60_000
  if (durationMins >= 120) return 1
  if (evt.kind === 'meet') return 2
  return 3
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function dayIndexFromStart(start: Date, now: Date): number {
  const today = startOfLocalDay(now).getTime()
  const day = startOfLocalDay(start).getTime()
  return Math.round((day - today) / 86_400_000)
}

function dayHeading(index: number, now: Date): string {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  const d = new Date(now)
  d.setDate(d.getDate() + index)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function horizonEnd(now: Date): Date {
  const end = new Date(now)
  end.setDate(end.getDate() + CALENDAR_RAIL_DAYS - 1)
  return endOfLocalDay(end)
}

function formatDurationMs(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatCompactTime(start: Date, end: Date, allDay: boolean): string {
  if (allDay) return 'All day'
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (startTime === endTime) return startTime
  return `${startTime} – ${endTime}`
}

function extractMeetLink(event: {
  hangoutLink?: string | null
  conferenceData?: { entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null } | null
}): string | undefined {
  if (event.hangoutLink) return event.hangoutLink
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
  return video?.uri ?? undefined
}

function toRailEvent(
  event: {
    id?: string | null
    summary?: string | null
    start?: { dateTime?: string | null; date?: string | null } | null
    end?: { dateTime?: string | null; date?: string | null } | null
    hangoutLink?: string | null
    conferenceData?: { entryPoints?: { entryPointType?: string | null; uri?: string | null }[] | null } | null
    htmlLink?: string | null
  },
  now: Date,
  accountId: string
): CalendarRailEvent | null {
  if (!event.id || !event.summary) return null
  const startRaw = event.start?.dateTime ?? event.start?.date
  const endRaw = event.end?.dateTime ?? event.end?.date
  if (!startRaw || !endRaw) return null

  const allDay = Boolean(event.start?.date && !event.start?.dateTime)
  const start = new Date(startRaw)
  let end = new Date(endRaw)
  if (allDay) end = new Date(end.getTime() - 1)

  const dayIndex = dayIndexFromStart(start, now)
  if (dayIndex < 0 || dayIndex >= CALENDAR_RAIL_DAYS) return null

  const link = extractMeetLink(event)
  if (allDay && !link) return null

  const live = start.getTime() <= now.getTime() && end.getTime() >= now.getTime()
  const ended = end.getTime() < now.getTime()
  // Keep ended events for today so the rail can show "Earlier today"
  if (ended && dayIndex !== 0) return null

  return {
    id: `${accountId}-${event.id}`,
    title: event.summary,
    timeLabel: formatCompactTime(start, end, allDay),
    durationLabel: formatDurationMs(end.getTime() - start.getTime()),
    kind: link?.includes('meet.google.com') ? 'meet' : 'calendar',
    link,
    live,
    ended,
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    dayIndex,
    dayHeading: dayHeading(dayIndex, now)
  }
}

function capEventsPerDay(events: CalendarRailEvent[]): CalendarRailEvent[] {
  const picked: CalendarRailEvent[] = []
  const upcomingByDay = new Map<number, number>()

  const todayPast = events
    .filter((e) => e.dayIndex === 0 && e.ended)
    .sort((a, b) => b.endsAt - a.endsAt)
    .slice(0, MAX_PAST_TODAY)

  picked.push(...todayPast)

  const upcoming = [...events]
    .filter((e) => !e.ended)
    .sort((a, b) => {
      const prio = eventPriority(a) - eventPriority(b)
      if (prio !== 0) return prio
      return a.startsAt - b.startsAt
    })

  for (const evt of upcoming) {
    const count = upcomingByDay.get(evt.dayIndex) ?? 0
    if (count >= MAX_UPCOMING_PER_DAY) continue
    upcomingByDay.set(evt.dayIndex, count + 1)
    picked.push(evt)
  }

  return picked.sort((a, b) => a.startsAt - b.startsAt)
}

async function listGoogleSelectedCalendarIds(
  calendar: ReturnType<typeof google.calendar>
): Promise<string[]> {
  const res = await calendar.calendarList.list({ minAccessRole: 'reader' })
  const ids =
    res.data.items
      ?.filter((item) => item.selected !== false && item.id)
      .map((item) => item.id!) ?? []

  return ids.length > 0 ? ids : ['primary']
}

function calendarEnabled(
  accountId: string,
  googleCalendarId: string,
  primary: boolean,
  selected: boolean | null | undefined,
  enabledSet: Set<string> | null
): boolean {
  const composite = compositeCalendarId(accountId, googleCalendarId)
  if (enabledSet) {
    if (enabledSet.has(composite)) return true
    // Legacy prefs stored bare Google calendar ids (single-account era)
    if (enabledSet.has(googleCalendarId)) return true
    return false
  }
  return selected !== false
}

async function resolveCalendarIdsForAccount(
  account: GmailAccountRecord,
  calendar: ReturnType<typeof google.calendar>
): Promise<string[]> {
  const custom = getNested<string[]>(['preferences', 'calendarIds'])
  if (custom?.length) {
    const forAccount: string[] = []
    const legacyBare: string[] = []
    for (const id of custom) {
      const parsed = parseCompositeCalendarId(id)
      if (parsed.accountId) {
        if (parsed.accountId === account.id) forAccount.push(parsed.calendarId)
      } else {
        legacyBare.push(parsed.calendarId)
      }
    }
    if (forAccount.length > 0) return forAccount
    if (legacyBare.length > 0) return legacyBare
  }
  return listGoogleSelectedCalendarIds(calendar)
}

export async function listGoogleCalendars(refresh = false): Promise<GoogleCalendarOption[]> {
  const blocked = googleApiBlockedMessage()
  if (blocked) {
    lastCalendarError = blocked
    return cachedCalendarOptions
  }

  if (!refresh && cachedCalendarOptionsAt > 0) {
    return cachedCalendarOptions
  }

  if (!(await isGoogleConnected())) return cachedCalendarOptions

  assertGoogleApiAllowed('calendar.listGoogleCalendars')

  const accounts = await calendarEnabledAccounts()
  const enabledIds = getNested<string[]>(['preferences', 'calendarIds'])
  const enabledSet = enabledIds?.length ? new Set(enabledIds) : null
  const options: GoogleCalendarOption[] = []

  for (const account of accounts) {
    try {
      const auth = authClientForTokens(account.tokens)
      const calendar = google.calendar({ version: 'v3', auth })
      const res = await calendar.calendarList.list({ minAccessRole: 'reader' }, GOOGLE_REQUEST_OPTS)

      for (const item of res.data.items ?? []) {
        if (!item.id || !item.summary) continue
        const composite = compositeCalendarId(account.id, item.id)
        options.push({
          id: composite,
          name: item.summaryOverride || item.summary || item.id,
          primary: item.primary === true,
          enabled: calendarEnabled(
            account.id,
            item.id,
            item.primary === true,
            item.selected,
            enabledSet
          ),
          accountId: account.id,
          accountEmail: account.email
        })
      }
    } catch (err) {
      markGoogleRateLimited(err, 'calendar.events')
      const message = err instanceof Error ? err.message : String(err)
      lastCalendarError = message
      console.error('[calendar] list failed for', account.email, err)
    }
  }

  cachedCalendarOptions = options.sort((a, b) => {
    if (a.accountEmail !== b.accountEmail) return a.accountEmail!.localeCompare(b.accountEmail!)
    if (a.primary !== b.primary) return a.primary ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  cachedCalendarOptionsAt = Date.now()
  return cachedCalendarOptions
}

export function getCachedGoogleCalendars(): GoogleCalendarOption[] {
  return cachedCalendarOptions
}

export function setEnabledCalendarIds(calendarIds: string[]): void {
  setNested(['preferences', 'calendarIds'], calendarIds)
}

export async function fetchCalendarEvents(): Promise<CalendarRailEvent[]> {
  const blocked = googleApiBlockedMessage()
  if (blocked) throw new Error(blocked)

  const accounts = await calendarEnabledAccounts()
  if (accounts.length === 0) return []

  assertGoogleApiAllowed('calendar.fetchEvents')

  const now = new Date()
  const timeMin = startOfLocalDay(now).toISOString()
  const timeMax = horizonEnd(now).toISOString()
  const byId = new Map<string, CalendarRailEvent>()

  for (const account of accounts) {
    try {
      const auth = authClientForTokens(account.tokens)
      const calendar = google.calendar({ version: 'v3', auth })
      const calendarIds = await resolveCalendarIdsForAccount(account, calendar)

      for (const calendarId of calendarIds) {
        const res = await calendar.events.list(
          {
            calendarId,
            timeMin,
            timeMax,
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime'
          },
          GOOGLE_REQUEST_OPTS
        )

        for (const event of res.data.items ?? []) {
          const rail = toRailEvent(event, now, account.id)
          if (rail) byId.set(rail.id, rail)
        }
      }
    } catch (err) {
      markGoogleRateLimited(err, 'calendar.events')
      const message = err instanceof Error ? err.message : String(err)
      lastCalendarError = message
      console.error('[calendar] events failed for', account.email, err)
    }
  }

  const rail = capEventsPerDay([...byId.values()])
  lastCalendarError = null
  return rail
}

export async function syncCalendar(refresh = false): Promise<CalendarRailEvent[]> {
  const blocked = googleApiBlockedMessage()
  if (blocked) {
    lastCalendarError = blocked
    return cachedEvents
  }

  if (!refresh) {
    return cachedEvents
  }

  try {
    cachedEvents = await fetchCalendarEvents()
    cachedAt = Date.now()
    return cachedEvents
  } catch (err) {
    markGoogleRateLimited(err, 'calendar.sync')
    const message = err instanceof Error ? err.message : String(err)
    lastCalendarError = message
    console.error('[calendar] sync failed:', err)
    return cachedEvents
  }
}

export function getCachedCalendarEvents(): CalendarRailEvent[] {
  return cachedEvents
}

/** Google Calendar cache + Cal.com bookings from the integration stream. */
export function getMergedCalendarRailEvents(): CalendarRailEvent[] {
  const { getCalcomCalendarRailEvents } = require('./calcom') as typeof import('./calcom')
  const byId = new Map<string, CalendarRailEvent>()
  for (const evt of cachedEvents) byId.set(evt.id, evt)
  for (const evt of getCalcomCalendarRailEvents()) byId.set(evt.id, evt)
  return [...byId.values()].sort((a, b) => a.startsAt - b.startsAt)
}

export function getCalendarCacheAgeMs(): number {
  return cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY
}

export function getLastCalendarError(): string | null {
  return effectiveGoogleSyncError(lastCalendarError)
}

export function calendarNeedsReconnect(error: string | null): boolean {
  if (!error) return false
  return /insufficient|scope|403|invalid_grant|unauthorized|access denied/i.test(error)
}
