import { createHash, randomBytes } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import type { CalendarRailEvent } from '../../shared/cluster'
import { normalizeCalcomBooking } from '../normalizer'
import { upsertItem, itemExists, getRecentItems } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'
import { expandMentionsWithContacts } from './contactsStore'

const CALCOM_CALENDAR_HORIZON_DAYS = 90

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
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

function formatDurationMs(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatCompactTime(start: Date, end: Date): string {
  const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (startTime === endTime) return startTime
  return `${startTime} – ${endTime}`
}

function calcomItemToRailEvent(item: StreamItem, now: Date): CalendarRailEvent | null {
  if (item.source !== 'calcom') return null

  const startRaw = item.metadata?.startTime
  if (typeof startRaw !== 'string' || !startRaw.trim()) return null

  const status = String(item.metadata?.status ?? 'scheduled').toLowerCase()
  if (status === 'cancelled' || status === 'canceled' || status === 'rejected') return null

  const start = new Date(startRaw)
  if (Number.isNaN(start.getTime())) return null

  const endRaw = item.metadata?.endTime
  const end =
    typeof endRaw === 'string' && endRaw.trim()
      ? new Date(endRaw)
      : new Date(start.getTime() + 30 * 60_000)
  if (Number.isNaN(end.getTime())) return null

  const dayIndex = dayIndexFromStart(start, now)
  const ended = end.getTime() < now.getTime()
  if (ended && dayIndex < 0) return null
  if (!ended && dayIndex > CALCOM_CALENDAR_HORIZON_DAYS) return null

  const bookingUid = String(item.metadata?.bookingUid ?? item.id.replace(/^calcom-/, ''))
  const link =
    typeof item.metadata?.url === 'string' && item.metadata.url.startsWith('http')
      ? item.metadata.url
      : `https://app.cal.com/bookings/${bookingUid}`

  const live = start.getTime() <= now.getTime() && end.getTime() >= now.getTime()

  return {
    id: `calcom-rail-${bookingUid}`,
    title: item.title?.trim() || 'Cal.com booking',
    timeLabel: formatCompactTime(start, end),
    durationLabel: formatDurationMs(end.getTime() - start.getTime()),
    kind: 'calendar',
    link,
    live,
    ended,
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    dayIndex,
    dayHeading: dayHeading(dayIndex, now)
  }
}

/** Upcoming Cal.com bookings for the calendar rail (from synced stream items). */
export function getCalcomCalendarRailEvents(): CalendarRailEvent[] {
  if (!isCalcomConnected()) return []
  const now = new Date()
  return getRecentItems(120, 'calcom')
    .map((item) => calcomItemToRailEvent(item, now))
    .filter((evt): evt is CalendarRailEvent => evt !== null)
    .sort((a, b) => a.startsAt - b.startsAt)
}

const CALCOM_AUTH_URL = 'https://app.cal.com/auth/oauth2/authorize'
const CALCOM_TOKEN_URL = 'https://api.cal.com/v2/auth/oauth2/token'
const CALCOM_API = 'https://api.cal.com/v2'
const CALCOM_API_VERSION = '2024-08-13'
/** Slots availability lives under /v2/slots starting with this version (2024-08-13 returns 404). */
const CALCOM_SLOTS_API_VERSION = '2024-09-04'

const oauthStateStore = new Map<string, { createdAt: number; pkceVerifier?: string }>()

function appBaseUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3131').replace(/\/$/, '')
}

function redirectUri(): string {
  return process.env.CALCOM_REDIRECT_URI?.trim() || `${appBaseUrl()}/api/auth/calcom/callback`
}

function oauthClientId(): string {
  const id = process.env.CALCOM_CLIENT_ID?.trim()
  if (!id) throw new Error('Cal.com OAuth not configured — set CALCOM_CLIENT_ID')
  return id
}

function oauthClientSecret(): string {
  const secret = process.env.CALCOM_CLIENT_SECRET?.trim()
  if (!secret) throw new Error('Cal.com OAuth not configured — set CALCOM_CLIENT_SECRET')
  return secret
}

function defaultScopes(): string {
  return (
    process.env.CALCOM_SCOPES?.trim() ||
    'BOOKING_READ BOOKING_WRITE EVENT_TYPE_READ PROFILE_READ SCHEDULE_READ'
  )
}

function usePkce(): boolean {
  return process.env.CALCOM_USE_PKCE === '1' || process.env.CALCOM_USE_PKCE === 'true'
}

function pruneOAuthStates(): void {
  const cutoff = Date.now() - 10 * 60_000
  for (const [state, entry] of oauthStateStore) {
    if (entry.createdAt < cutoff) oauthStateStore.delete(state)
  }
}

function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

async function exchangeTokens(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(CALCOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
  const data = (await res.json()) as TokenResponse
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.error ?? `Cal.com token exchange failed (${res.status})`)
  }
  if (!data.access_token) throw new Error('Cal.com token response missing access_token')
  return data
}

export function getCalcomAuthUrl(): { url: string; state: string } {
  pruneOAuthStates()
  const state = randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    state,
    scope: defaultScopes()
  })

  let pkceVerifier: string | undefined
  if (usePkce()) {
    pkceVerifier = randomBytes(32).toString('base64url')
    params.set('code_challenge', pkceChallenge(pkceVerifier))
    params.set('code_challenge_method', 'S256')
  }

  oauthStateStore.set(state, { createdAt: Date.now(), pkceVerifier })
  return { url: `${CALCOM_AUTH_URL}?${params.toString()}`, state }
}

export async function handleCalcomCallback(code: string, state: string): Promise<void> {
  const entry = oauthStateStore.get(state)
  if (!entry) throw new Error('Invalid or expired Cal.com OAuth state')
  oauthStateStore.delete(state)

  const body: Record<string, string> = {
    client_id: oauthClientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri()
  }

  if (entry.pkceVerifier) {
    body.code_verifier = entry.pkceVerifier
  } else {
    body.client_secret = oauthClientSecret()
  }

  const data = await exchangeTokens(body)
  const existing = getToken('calcom') ?? {}

  setToken('calcom', {
    ...existing,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing.refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope ?? existing.scope,
    tokenType: data.token_type ?? 'bearer'
  })
  setConnection('calcom', true)

  try {
    const profile = await fetchCalcomProfile(data.access_token!)
    if (profile) {
      const current = getToken('calcom') ?? {}
      setToken('calcom', { ...current, ...profile })
    }
  } catch {
    /* profile optional */
  }

  try {
    const types = await fetchCalcomEventTypes()
    if (types[0]) cacheDefaultEventType(types[0])
  } catch {
    /* event types optional at connect */
  }
}

async function refreshCalcomAccessToken(): Promise<string> {
  const tokens = getToken('calcom')
  const refreshToken = String(tokens?.refreshToken ?? '')
  if (!refreshToken) throw new Error('Cal.com refresh token missing — reconnect OAuth')

  const body: Record<string, string> = {
    client_id: oauthClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  }
  if (!usePkce()) body.client_secret = oauthClientSecret()

  const data = await exchangeTokens(body)
  setToken('calcom', {
    ...tokens,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope ?? tokens?.scope
  })
  return data.access_token!
}

async function getCalcomBearer(): Promise<{ token: string; oauth: boolean }> {
  const session = getToken('calcom')
  const sessionKey = String(session?.apiKey ?? '').trim()
  if (sessionKey) return { token: sessionKey, oauth: false }

  const sessionOAuth = String(session?.accessToken ?? '').trim()
  if (sessionOAuth) {
    const expiresAt = Number(session?.expiresAt ?? 0)
    if (expiresAt && expiresAt - Date.now() < 120_000) {
      return { token: await refreshCalcomAccessToken(), oauth: true }
    }
    return { token: sessionOAuth, oauth: true }
  }

  const envKey = envApiKey()
  if (envKey) return { token: envKey, oauth: false }

  throw new Error('Cal.com not connected — add API key in Apps → Cal.com or set CALCOM_API_KEY')
}

function envApiKey(): string | undefined {
  const key = process.env.CALCOM_API_KEY?.trim()
  return key || undefined
}

function getCalcomAuthKind(): 'apiKey' | 'oauth' | null {
  const session = getToken('calcom')
  if (String(session?.apiKey ?? '').trim() || envApiKey()) return 'apiKey'
  if (String(session?.accessToken ?? '').trim()) return 'oauth'
  return null
}

async function calcomApi<T>(path: string, query?: Record<string, string>): Promise<T> {
  const { token, oauth } = await getCalcomBearer()
  const url = new URL(`${CALCOM_API}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value)
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'cal-api-version': CALCOM_API_VERSION
  }

  let res = await fetch(url, { headers })

  if (res.status === 401 && oauth) {
    const refreshed = await refreshCalcomAccessToken()
    res = await fetch(url, {
      headers: { ...headers, Authorization: `Bearer ${refreshed}` }
    })
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Cal.com API ${res.status}`)
  }
  return (await res.json()) as T
}

async function fetchCalcomProfile(accessToken: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${CALCOM_API}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'cal-api-version': CALCOM_API_VERSION
    }
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: Record<string, unknown>; username?: string; name?: string }
  const profile = json.data ?? json
  const username = String(profile.username ?? profile.name ?? '').trim()
  return username ? { username, accountLabel: username } : null
}

type CalcomBookingRow = Record<string, unknown>

function bookingRows(payload: unknown): CalcomBookingRow[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as { data?: unknown; bookings?: unknown }
  const data = root.data
  if (Array.isArray(data)) return data as CalcomBookingRow[]
  if (data && typeof data === 'object' && Array.isArray((data as { bookings?: unknown }).bookings)) {
    return (data as { bookings: CalcomBookingRow[] }).bookings
  }
  if (Array.isArray(root.bookings)) return root.bookings as CalcomBookingRow[]
  return []
}

export async function fetchCalcomBookings(limit = 24): Promise<StreamItem[]> {
  const items: StreamItem[] = []
  const seen = new Set<string>()

  for (const status of ['upcoming', 'past'] as const) {
    const payload = await calcomApi<unknown>('/bookings', {
      status,
      limit: String(Math.min(limit, 30)),
      sortStart: status === 'upcoming' ? 'asc' : 'desc'
    })
    for (const row of bookingRows(payload)) {
      const normalized = normalizeCalcomBooking(row)
      if (!normalized || seen.has(normalized.id)) continue
      seen.add(normalized.id)
      items.push(normalized)
    }
  }

  return items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, limit)
}

export async function syncCalcom(io?: SocketServer): Promise<StreamItem[]> {
  if (!getToken('calcom')) return []

  try {
    const types = await fetchCalcomEventTypes()
    if (types[0]) cacheDefaultEventType(types[0])
  } catch {
    /* continue sync even if event type discovery fails */
  }

  try {
    const items = await fetchCalcomBookings(24)
    const newItems = items.filter((i) => !itemExists(i.id))
    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)
    return items
  } catch (err) {
    console.error('[calcom] sync failed:', (err as Error).message)
    return []
  }
}

export function isCalcomConfigured(): boolean {
  if (envApiKey()) return true
  const id = process.env.CALCOM_CLIENT_ID?.trim()
  if (!id) return false
  if (usePkce()) return true
  return !!process.env.CALCOM_CLIENT_SECRET?.trim()
}

export function isCalcomConnected(): boolean {
  return getCalcomAuthKind() !== null
}

export function calcomAuthMode(): 'apiKey' | 'oauth' | null {
  return getCalcomAuthKind()
}

export async function connectCalcomWithApiKey(
  apiKey: string,
  opts?: { username?: string; eventTypeId?: number | string }
): Promise<void> {
  const key = apiKey.trim()
  if (!key) throw new Error('Cal.com API key required')

  const res = await fetch(`${CALCOM_API}/bookings?limit=1`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'cal-api-version': CALCOM_API_VERSION
    }
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Cal.com API key rejected (${res.status})`)
  }

  const existing = getToken('calcom') ?? {}
  const eventTypeId = opts?.eventTypeId ?? existing.eventTypeId ?? process.env.CALCOM_EVENT_TYPE_ID
  setToken('calcom', {
    ...existing,
    apiKey: key,
    authType: 'apiKey',
    accessToken: undefined,
    refreshToken: undefined,
    expiresAt: undefined,
    username: opts?.username?.trim() || String(existing.username ?? process.env.CALCOM_USERNAME ?? ''),
    eventTypeId: eventTypeId ? Number(eventTypeId) : undefined
  })
  setConnection('calcom', true)

  try {
    const profile = await fetchCalcomProfile(key)
    if (profile) {
      setToken('calcom', { ...getToken('calcom'), ...profile })
    }
  } catch {
    /* optional */
  }

  try {
    const types = await fetchCalcomEventTypes()
    if (types[0]) cacheDefaultEventType(types[0])
  } catch {
    /* optional */
  }
}

export function calcomAccountLabel(): string | undefined {
  const t = getToken('calcom')
  const label = String(t?.accountLabel ?? t?.username ?? '').trim()
  return label || undefined
}

export type CalcomBookInput = {
  eventTypeSlug?: string
  eventTypeId?: number
  attendeeEmail: string
  attendeeName: string
  start?: string
  notes?: string
  timeZone?: string
  /** Additional guest emails beyond the primary attendee */
  guests?: string[]
}

export type CalcomBookResult = {
  ok: boolean
  message: string
  bookingUid?: string
  bookingUrl?: string
}

function calcomUsername(): string {
  const fromToken = String(getToken('calcom')?.username ?? '').trim()
  const fromEnv = String(process.env.CALCOM_USERNAME ?? '').trim()
  return fromToken || fromEnv
}

function defaultEventSlug(): string {
  const fromToken = String(getToken('calcom')?.defaultEventSlug ?? '').trim()
  if (fromToken) return fromToken
  return String(process.env.CALCOM_DEFAULT_EVENT_TYPE_SLUG ?? '').trim()
}

function defaultTimeZone(): string {
  return String(process.env.CALCOM_TIMEZONE ?? 'America/New_York').trim() || 'America/New_York'
}

function unwrapData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as { data?: T }
  return (root.data ?? payload) as T
}

async function calcomApiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { token, oauth } = await getCalcomBearer()
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'cal-api-version': CALCOM_API_VERSION
  }

  let res = await fetch(`${CALCOM_API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (res.status === 401 && oauth) {
    const refreshed = await refreshCalcomAccessToken()
    res = await fetch(`${CALCOM_API}${path}`, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${refreshed}` },
      body: JSON.stringify(body)
    })
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Cal.com API ${res.status}`)
  }
  return (await res.json()) as T
}

type CalEventType = { id: number; slug?: string; title?: string }

function isCalEventType(row: unknown): row is CalEventType {
  return !!row && typeof row === 'object' && Number((row as CalEventType).id) > 0
}

function eventTypeRows(payload: unknown): CalEventType[] {
  const data = unwrapData<unknown>(payload)
  const out: CalEventType[] = []

  const push = (rows: unknown) => {
    if (!Array.isArray(rows)) return
    for (const row of rows) {
      if (isCalEventType(row)) out.push(row)
    }
  }

  push(data)
  if (out.length > 0) return out

  if (data && typeof data === 'object') {
    push((data as { eventTypes?: unknown[] }).eventTypes)
    const groups = (data as { eventTypeGroups?: unknown[] }).eventTypeGroups
    if (Array.isArray(groups)) {
      for (const group of groups) {
        push((group as { eventTypes?: unknown[] }).eventTypes)
      }
    }
  }

  if (out.length > 0) return out
  if (Array.isArray(payload)) return payload.filter(isCalEventType)
  return out
}

async function calcomApiGet<T>(
  path: string,
  query?: Record<string, string>,
  apiVersion = CALCOM_API_VERSION
): Promise<T> {
  const { token, oauth } = await getCalcomBearer()
  const url = new URL(`${CALCOM_API}${path}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) url.searchParams.set(key, value)
    }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'cal-api-version': apiVersion
  }

  let res = await fetch(url, { headers })
  if (res.status === 401 && oauth) {
    const refreshed = await refreshCalcomAccessToken()
    res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${refreshed}` } })
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `Cal.com API ${res.status}`)
  }
  return (await res.json()) as T
}

function cacheDefaultEventType(event: CalEventType): void {
  if (!event.id) return
  const current = getToken('calcom') ?? {}
  setToken('calcom', {
    ...current,
    eventTypeId: Number(current.eventTypeId) > 0 ? current.eventTypeId : event.id,
    defaultEventSlug: String(current.defaultEventSlug ?? event.slug ?? '').trim() || event.slug
  })
}

export async function fetchCalcomEventTypes(opts?: {
  username?: string
  slug?: string
}): Promise<CalEventType[]> {
  const username = (opts?.username ?? calcomUsername()).trim()
  const slug = opts?.slug?.trim()
  const attempts: Array<{ query?: Record<string, string>; version: string }> = [
    { version: CALCOM_API_VERSION },
    { version: '2024-06-14' }
  ]

  if (username) {
    attempts.unshift({ query: slug ? { username, eventSlug: slug } : { username }, version: CALCOM_API_VERSION })
    attempts.push({ query: { username }, version: '2024-06-14' })
  }

  const seen = new Set<number>()
  const merged: CalEventType[] = []

  for (const attempt of attempts) {
    try {
      const payload = await calcomApiGet<unknown>('/event-types', attempt.query, attempt.version)
      for (const row of eventTypeRows(payload)) {
        if (!row.id || seen.has(row.id)) continue
        seen.add(row.id)
        merged.push(row)
      }
    } catch {
      /* try next strategy */
    }
  }

  return merged
}

function defaultEventTypeId(): number | undefined {
  const fromToken = Number(getToken('calcom')?.eventTypeId)
  if (fromToken > 0) return fromToken
  const fromEnv = Number(process.env.CALCOM_EVENT_TYPE_ID)
  return fromEnv > 0 ? fromEnv : undefined
}

async function resolveEventType(slug?: string): Promise<CalEventType> {
  const configuredId = defaultEventTypeId()
  const preferredSlug = (slug ?? defaultEventSlug()).trim()
  const list = await fetchCalcomEventTypes(preferredSlug ? { slug: preferredSlug } : undefined)

  if (list.length > 0) {
    const hit =
      (preferredSlug
        ? list.find((e) => e.slug === preferredSlug) ??
          list.find((e) => String(e.slug ?? '').includes(preferredSlug))
        : undefined) ?? list[0]
    if (hit?.id) {
      cacheDefaultEventType(hit)
      return hit
    }
  }

  if (configuredId) {
    const fromList = list.find((e) => e.id === configuredId)
    return { id: configuredId, slug: fromList?.slug ?? (preferredSlug || undefined) }
  }

  if (list.length > 0) {
    cacheDefaultEventType(list[0])
    return list[0]
  }

  const username = calcomUsername()
  if (!username) {
    throw new Error(
      'Cal.com event type not found — reconnect in Apps → Cal.com or set CALCOM_EVENT_TYPE_ID in Advanced settings'
    )
  }
  throw new Error(
    `Cal.com event type not found${preferredSlug ? ` for "${preferredSlug}"` : ''} — add your event type ID under Apps → Cal.com → Advanced`
  )
}

function parseIsoStart(value?: string): string | null {
  return resolveBookingStart(value)
}

/** Parse ISO or natural-language start times — slash-format compose often passes "June 10 2026 2pm". */
function resolveBookingStart(value?: string): string | null {
  if (!value || value === 'auto') return null

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  const natural = parseNaturalDateTime(trimmed)
  if (natural) return natural.toISOString()

  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2020) return d.toISOString()

  return null
}

function parseSlotsByDay(payload: unknown): Record<string, string[]> {
  const data = unwrapData<unknown>(payload) ?? payload
  if (!data || typeof data !== 'object') return {}

  const root = data as { slots?: unknown }
  const slotsNode = root.slots ?? data
  if (!slotsNode || typeof slotsNode !== 'object') return {}

  const out: Record<string, string[]> = {}
  for (const [day, value] of Object.entries(slotsNode as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[day] = value.map(String)
      continue
    }
    if (value && typeof value === 'object') {
      out[day] = Object.keys(value as Record<string, unknown>).sort()
    }
  }
  return out
}

function firstSlotIso(slotsRoot: Record<string, string[]>): string | null {
  const times: Array<{ day: string; time: string }> = []
  for (const [day, value] of Object.entries(slotsRoot)) {
    for (const t of value) times.push({ day, time: t })
  }
  if (times.length === 0) return null

  times.sort((a, b) => {
    const aIso = a.time.includes('T') ? a.time : `${a.day}T${a.time}`
    const bIso = b.time.includes('T') ? b.time : `${b.day}T${b.time}`
    return aIso.localeCompare(bIso)
  })

  const first = times[0]
  if (first.time.includes('T')) return new Date(first.time).toISOString()

  const padded = first.time.length <= 5 ? `${first.time}:00` : first.time
  const local = new Date(`${first.day}T${padded}`)
  if (!Number.isNaN(local.getTime())) return local.toISOString()

  return new Date(`${first.day}T${first.time}Z`).toISOString()
}

async function fetchCalcomAvailableSlots(opts: {
  eventTypeId: number
  timeZone: string
  start: Date
  end: Date
  eventTypeSlug?: string
  username?: string
}): Promise<Record<string, string[]>> {
  const startDate = opts.start.toISOString().slice(0, 10)
  const endDate = opts.end.toISOString().slice(0, 10)

  const attempts: Array<{ path: string; query: Record<string, string>; version: string }> = [
    {
      path: '/slots',
      query: {
        eventTypeId: String(opts.eventTypeId),
        start: startDate,
        end: endDate,
        timeZone: opts.timeZone
      },
      version: CALCOM_SLOTS_API_VERSION
    },
    {
      path: '/slots/available',
      query: {
        eventTypeId: String(opts.eventTypeId),
        startTime: opts.start.toISOString(),
        endTime: opts.end.toISOString(),
        timeZone: opts.timeZone
      },
      version: CALCOM_API_VERSION
    }
  ]

  if (opts.eventTypeSlug && opts.username) {
    attempts.unshift({
      path: '/slots',
      query: {
        eventTypeSlug: opts.eventTypeSlug,
        username: opts.username,
        start: startDate,
        end: endDate,
        timeZone: opts.timeZone
      },
      version: CALCOM_SLOTS_API_VERSION
    })
  }

  let lastErr: Error | null = null
  for (const attempt of attempts) {
    try {
      const payload = await calcomApiGet<unknown>(attempt.path, attempt.query, attempt.version)
      const parsed = parseSlotsByDay(payload)
      if (Object.keys(parsed).length > 0) return parsed
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastErr ?? new Error('Cal.com returned no open slots — pick a time manually')
}

async function pickNextSlot(
  eventType: { id: number; slug?: string },
  timeZone: string
): Promise<string> {
  const start = new Date()
  start.setHours(start.getHours() + 2)
  const end = new Date(start)
  end.setDate(end.getDate() + 14)

  const username = calcomUsername()
  const slotsRoot = await fetchCalcomAvailableSlots({
    eventTypeId: eventType.id,
    timeZone,
    start,
    end,
    eventTypeSlug: eventType.slug,
    username: username || undefined
  })

  const iso = firstSlotIso(slotsRoot)
  if (!iso) {
    throw new Error('No open Cal.com slots in the next two weeks — pick a time manually')
  }
  return iso
}

const MONTH_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
}

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'Guest'
  return local
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function applyAmPm(hour: number, ampm?: string): number {
  if (!ampm) return hour
  if (ampm === 'am') return hour === 12 ? 0 : hour
  return hour === 12 ? 12 : hour + 12
}

function parseClock(text: string): { hour: number; minute: number } | null {
  const lower = text.toLowerCase()
  const range = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/
  )
  if (range) {
    let hour = Number(range[1])
    const minute = Number(range[2] ?? 0)
    const startMeridiem = range[3] ?? range[6]
    hour = applyAmPm(hour, startMeridiem)
    return { hour, minute }
  }

  const single = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  if (single) {
    return {
      hour: applyAmPm(Number(single[1]), single[3]),
      minute: Number(single[2] ?? 0)
    }
  }

  const twentyFour = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (twentyFour) {
    return { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) }
  }

  return null
}

function parseCalendarDate(text: string, hour: number, minute: number): Date | null {
  const lower = text.toLowerCase()
  const now = new Date()

  function startOfLocalDay(date: Date): Date {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const iso = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hour, minute, 0, 0)
  }

  const slash = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (slash) {
    const month = Number(slash[1]) - 1
    const day = Number(slash[2])
    let year = slash[3] ? Number(slash[3]) : now.getFullYear()
    if (year < 100) year += 2000
    return new Date(year, month, day, hour, minute, 0, 0)
  }

  const monthFirst = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/
  )
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1]]
    if (month == null) return null
    const day = Number(monthFirst[2])
    let year = monthFirst[3] ? Number(monthFirst[3]) : now.getFullYear()
    let date = new Date(year, month, day, hour, minute, 0, 0)
    if (!monthFirst[3] && date.getTime() < startOfLocalDay(now).getTime()) {
      date = new Date(year + 1, month, day, hour, minute, 0, 0)
    }
    return date
  }

  const dayFirst = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:,?\s+(\d{4}))?\b/
  )
  if (dayFirst) {
    const month = MONTH_INDEX[dayFirst[2]]
    if (month == null) return null
    const day = Number(dayFirst[1])
    let year = dayFirst[3] ? Number(dayFirst[3]) : now.getFullYear()
    let date = new Date(year, month, day, hour, minute, 0, 0)
    if (!dayFirst[3] && date.getTime() < startOfLocalDay(now).getTime()) {
      date = new Date(year + 1, month, day, hour, minute, 0, 0)
    }
    return date
  }

  if (/\btoday\b/.test(lower)) {
    const d = new Date(now)
    d.setHours(hour, minute, 0, 0)
    return d
  }

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(hour, minute, 0, 0)
    return d
  }

  const weekday = lower.match(
    /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/
  )
  if (weekday) {
    const dayMap: Record<string, number> = {
      sunday: 0,
      sun: 0,
      monday: 1,
      mon: 1,
      tuesday: 2,
      tue: 2,
      tues: 2,
      wednesday: 3,
      wed: 3,
      thursday: 4,
      thu: 4,
      thur: 4,
      thurs: 4,
      friday: 5,
      fri: 5,
      saturday: 6,
      sat: 6
    }
    const target = dayMap[weekday[2]]
    if (target == null) return null
    const date = new Date(now)
    date.setHours(hour, minute, 0, 0)
    let addDays = (target - date.getDay() + 7) % 7
    if (weekday[1] && addDays === 0) addDays = 7
    date.setDate(date.getDate() + addDays)
    return date
  }

  return null
}

function parseNaturalDateTime(text: string): Date | null {
  if (/\b(right now|asap|immediately)\b/i.test(text)) {
    const d = new Date()
    d.setSeconds(0, 0)
    return d
  }
  const clock = parseClock(text) ?? { hour: 9, minute: 0 }
  return parseCalendarDate(text, clock.hour, clock.minute)
}

function stripGuestPhrases(text: string): string {
  return text
    .replace(/guests?\s+(are|include|includes|:)/gi, ' ')
    .replace(/\bincluding\b/gi, ' ')
    .replace(/\b(with|and|plus|for)\b/gi, ' ')
    .replace(/(^|[\s(,])@[a-z0-9_.-]+/gi, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, ' ')
    .replace(/\b(pst|pdt|est|edt|cst|cdt|mst|mdt|utc|gmt)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseTimeZoneFromText(text: string): string | undefined {
  const lower = text.toLowerCase()
  if (/\b(pst|pdt|pacific)\b/.test(lower)) return 'America/Los_Angeles'
  if (/\b(mst|mdt|mountain)\b/.test(lower)) return 'America/Denver'
  if (/\b(cst|cdt|central)\b/.test(lower)) return 'America/Chicago'
  if (/\b(est|edt|eastern)\b/.test(lower)) return 'America/New_York'
  if (/\butc\b/.test(lower)) return 'UTC'
  return undefined
}

export function parseCalcomBookBody(body: string): CalcomBookInput {
  const trimmed = body.trim()
  if (trimmed.includes(' / ')) {
    const parts = trimmed.split(' / ').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 3 && parts[1].includes('@')) {
      const [eventTypeSlug, attendeeEmail, attendeeName, startRaw, ...noteParts] = parts
      if (!attendeeEmail.includes('@')) {
        throw new Error('Attendee email is required — include client email from the call')
      }
      return {
        eventTypeSlug,
        attendeeEmail,
        attendeeName,
        start: startRaw && startRaw !== 'auto' ? resolveBookingStart(startRaw) ?? undefined : undefined,
        notes: noteParts.join(' / ') || undefined,
        timeZone: defaultTimeZone()
      }
    }
  }

  const emails = [...trimmed.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase())
  if (emails.length === 0) {
    throw new Error(
      'Include at least one guest — sync contacts in Apps → Gmail, then use @name (e.g. @martin) or paste emails.'
    )
  }

  const dateText = stripGuestPhrases(trimmed)
  const when = parseNaturalDateTime(dateText)
  if (!when) {
    throw new Error(
      'Could not parse date/time — try "@cal book @martin for July 10 2026 2:30pm PST"'
    )
  }

  const extraGuests = emails.slice(1)
  const timeZone = parseTimeZoneFromText(trimmed) ?? defaultTimeZone()

  return {
    attendeeEmail: emails[0],
    attendeeName: nameFromEmail(emails[0]),
    start: when.toISOString(),
    guests: extraGuests.length > 0 ? extraGuests : undefined,
    timeZone
  }
}

export function parseSchedulingTimeFromText(text: string): string | null {
  const when = parseNaturalDateTime(text)
  return when ? when.toISOString() : null
}

export async function findCalcomBookingUidByEmail(email: string): Promise<string | undefined> {
  const lower = email.toLowerCase()
  for (const item of getRecentItems(80, 'calcom')) {
    const attendee = String(item.metadata?.attendeeEmail ?? '').toLowerCase()
    if (attendee !== lower) continue
    const uid = String(item.metadata?.bookingUid ?? item.id.replace(/^calcom-/, '')).trim()
    if (uid) return uid
  }

  try {
    for (const item of await fetchCalcomBookings(40)) {
      const attendee = String(item.metadata?.attendeeEmail ?? '').toLowerCase()
      if (attendee !== lower) continue
      const uid = String(item.metadata?.bookingUid ?? item.id.replace(/^calcom-/, '')).trim()
      if (uid) return uid
    }
  } catch {
    /* optional API lookup */
  }

  return undefined
}

export type CalcomRescheduleInput = {
  bookingUid: string
  start: string
  reschedulingReason?: string
}

export type CalcomCancelInput = {
  bookingUid: string
  cancellationReason?: string
}

export async function rescheduleCalcomBooking(input: CalcomRescheduleInput): Promise<CalcomBookResult> {
  if (!isCalcomConnected()) {
    return {
      ok: false,
      message: 'Cal.com not connected — add API key in Apps → Cal.com or set CALCOM_API_KEY'
    }
  }

  const start = parseIsoStart(input.start)
  if (!start) {
    return { ok: false, message: 'New start time required for reschedule — add proposed time' }
  }

  try {
    const body: Record<string, unknown> = { start }
    if (input.reschedulingReason) body.reschedulingReason = input.reschedulingReason

    const created = await calcomApiPost<unknown>(`/bookings/${input.bookingUid}/reschedule`, body)
    const booking = unwrapData<Record<string, unknown>>(created) ?? {}
    const uid = String(booking.uid ?? input.bookingUid)
    const bookingUrl = uid ? `https://cal.com/booking/${uid}` : undefined

    return {
      ok: true,
      message: bookingUrl
        ? `Rescheduled to ${new Date(start).toLocaleString()} · ${bookingUrl}`
        : `Rescheduled to ${new Date(start).toLocaleString()}`,
      bookingUid: uid || undefined,
      bookingUrl
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function cancelCalcomBooking(input: CalcomCancelInput): Promise<CalcomBookResult> {
  if (!isCalcomConnected()) {
    return {
      ok: false,
      message: 'Cal.com not connected — add API key in Apps → Cal.com or set CALCOM_API_KEY'
    }
  }

  try {
    const body: Record<string, unknown> = {}
    if (input.cancellationReason) body.cancellationReason = input.cancellationReason

    await calcomApiPost<unknown>(`/bookings/${input.bookingUid}/cancel`, body)
    return {
      ok: true,
      message: `Cancelled booking ${input.bookingUid}`,
      bookingUid: input.bookingUid
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export async function createCalcomBooking(input: CalcomBookInput): Promise<CalcomBookResult> {
  if (!isCalcomConnected()) {
    return {
      ok: false,
      message: 'Cal.com not connected — add API key in Apps → Cal.com or set CALCOM_API_KEY'
    }
  }

  const eventType = input.eventTypeId
    ? { id: input.eventTypeId, slug: input.eventTypeSlug }
    : await resolveEventType(input.eventTypeSlug)
  const timeZone = input.timeZone ?? defaultTimeZone()
  const start =
    resolveBookingStart(input.start) ?? (await pickNextSlot(eventType, timeZone))

  const username = calcomUsername()
  const payload: Record<string, unknown> = {
    start,
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      timeZone
    },
    metadata: input.notes ? { notes: input.notes } : undefined
  }

  if (input.guests?.length) {
    payload.guests = input.guests
  }

  if (username && eventType.slug) {
    payload.eventTypeSlug = eventType.slug
    payload.username = username
  } else {
    payload.eventTypeId = eventType.id
  }

  const created = await calcomApiPost<unknown>('/bookings', payload)
  const booking = unwrapData<Record<string, unknown>>(created) ?? {}
  const uid = String(booking.uid ?? booking.id ?? '')
  const bookingUrl = uid ? `https://cal.com/booking/${uid}` : undefined

  return {
    ok: true,
    message: bookingUrl
      ? `Booked ${input.attendeeName} · ${new Date(start).toLocaleString()} · ${bookingUrl}`
      : `Booked ${input.attendeeName} for ${new Date(start).toLocaleString()}`,
    bookingUid: uid || undefined,
    bookingUrl
  }
}

export async function executeCalcomCompose(composeText: string): Promise<CalcomBookResult> {
  const expanded = expandMentionsWithContacts(composeText)
  const match = expanded.match(/^@(?:calcom|cal)\s+book\s*:?\s+(.+)$/is)
  if (!match?.[1]) {
    return {
      ok: false,
      message: 'Use @cal book June 10 2026 1pm guests are client@co.com'
    }
  }
  try {
    const input = parseCalcomBookBody(match[1].trim())
    return createCalcomBooking(input)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function buildCalcomBookCompose(input: {
  title?: string
  attendeeEmail?: string
  attendeeName?: string
  suggestedStart?: string
  eventTypeSlug?: string
  notes?: string
}): string {
  const slug = input.eventTypeSlug ?? defaultEventSlug()
  const email = input.attendeeEmail ?? ''
  const name = input.attendeeName ?? 'Client'
  const start =
    input.suggestedStart && input.suggestedStart !== 'null' ? input.suggestedStart : 'auto'
  const notes = input.notes ?? input.title ?? 'Follow-up from call'
  return `@calcom book: ${slug} / ${email} / ${name} / ${start} / ${notes}`
}
