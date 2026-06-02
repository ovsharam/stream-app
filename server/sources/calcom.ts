import { createHash, randomBytes } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import { normalizeCalcomBooking } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'

const CALCOM_AUTH_URL = 'https://app.cal.com/auth/oauth2/authorize'
const CALCOM_TOKEN_URL = 'https://api.cal.com/v2/auth/oauth2/token'
const CALCOM_API = 'https://api.cal.com/v2'
const CALCOM_API_VERSION = '2024-08-13'

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
  return String(process.env.CALCOM_DEFAULT_EVENT_TYPE_SLUG ?? '30min').trim() || '30min'
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

function defaultEventTypeId(): number | undefined {
  const fromToken = Number(getToken('calcom')?.eventTypeId)
  if (fromToken > 0) return fromToken
  const fromEnv = Number(process.env.CALCOM_EVENT_TYPE_ID)
  return fromEnv > 0 ? fromEnv : undefined
}

async function resolveEventType(slug?: string): Promise<CalEventType> {
  const configuredId = defaultEventTypeId()
  if (configuredId) {
    return { id: configuredId, slug: slug ?? defaultEventSlug() }
  }

  const needle = (slug ?? defaultEventSlug()).trim()
  const username = calcomUsername()

  let list: CalEventType[] = []
  try {
    const payload = username
      ? await calcomApi<unknown>('/event-types', { username })
      : await calcomApi<unknown>('/event-types')
    const rows = unwrapData<CalEventType[]>(payload) ?? []
    list = Array.isArray(rows) ? rows : []
  } catch {
    list = []
  }

  const hit =
    list.find((e) => e.slug === needle) ??
    list.find((e) => String(e.slug ?? '').includes(needle)) ??
    list[0]

  if (hit?.id) return hit

  if (!username) {
    throw new Error(
      'Cal.com event type not found — set CALCOM_EVENT_TYPE_ID or CALCOM_USERNAME in .env.local'
    )
  }
  throw new Error(`Cal.com event type not found for slug "${needle}"`)
}

function parseIsoStart(value?: string): string | null {
  if (!value || value === 'auto') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

async function pickNextSlot(eventTypeId: number, timeZone: string): Promise<string> {
  const start = new Date()
  start.setHours(start.getHours() + 2)
  const end = new Date(start)
  end.setDate(end.getDate() + 14)

  const payload = await calcomApi<unknown>('/slots', {
    eventTypeId: String(eventTypeId),
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    timeZone
  })

  const data = unwrapData<Record<string, string[] | string>>(payload) ?? {}
  const slotsRoot =
    (data as { slots?: Record<string, string[]> }).slots ??
    (typeof data === 'object' ? (data as Record<string, string[]>) : {})

  const times: string[] = []
  for (const value of Object.values(slotsRoot)) {
    if (Array.isArray(value)) {
      for (const t of value) times.push(String(t))
    }
  }

  if (times.length === 0) {
    throw new Error('No open Cal.com slots in the next two weeks — pick a time manually')
  }

  times.sort()
  const first = times[0]
  if (first.includes('T')) return new Date(first).toISOString()
  const day = Object.keys(slotsRoot).sort()[0]
  return new Date(`${day}T${first}Z`).toISOString()
}

export function parseCalcomBookBody(body: string): CalcomBookInput {
  const parts = body.split(' / ').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 3) {
    throw new Error('Use @calcom book: event-slug / email / name / start-or-auto / notes')
  }
  const [eventTypeSlug, attendeeEmail, attendeeName, startRaw, ...noteParts] = parts
  if (!attendeeEmail.includes('@')) {
    throw new Error('Attendee email is required — include client email from the call')
  }
  return {
    eventTypeSlug,
    attendeeEmail,
    attendeeName,
    start: startRaw && startRaw !== 'auto' ? startRaw : undefined,
    notes: noteParts.join(' / ') || undefined,
    timeZone: defaultTimeZone()
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
    parseIsoStart(input.start) ?? (await pickNextSlot(eventType.id, timeZone))

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

  if (username && input.eventTypeSlug) {
    payload.eventTypeSlug = input.eventTypeSlug ?? eventType.slug ?? defaultEventSlug()
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
  const match = composeText.match(/^@calcom\s+book\s*:\s*(.+)$/is)
  if (!match?.[1]) {
    return { ok: false, message: 'Use @calcom book: event-slug / email / name / auto / notes' }
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
