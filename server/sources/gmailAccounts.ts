import { google } from 'googleapis'
import { createHash } from 'crypto'
import * as session from '../session'
import { getSessionIdFromContext } from '../request-context'
import { getOAuth2Client } from './googleOAuth'

export type GmailAccountRecord = {
  id: string
  email: string
  tokens: Record<string, unknown>
  feedEnabled: boolean
  calendarEnabled: boolean
  addedAt: number
}

const STORE_KEY = 'gmail-accounts'

function resolveSessionId(explicit?: string): string {
  return explicit ?? getSessionIdFromContext()
}

function accountIdForEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
}

function readStore(sid: string): GmailAccountRecord[] {
  const raw = session.getToken(sid, STORE_KEY) as { accounts?: GmailAccountRecord[] } | undefined
  return raw?.accounts ?? []
}

function writeStore(sid: string, accounts: GmailAccountRecord[]): void {
  session.setToken(sid, STORE_KEY, { accounts })
}

function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string' || !idToken.includes('.')) return null
  try {
    const payload = idToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
    }
    const email = json.email?.trim()
    return email || null
  } catch {
    return null
  }
}

export function formatGoogleRateLimitError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err)
  if (!/user-rate limit|rate limit|quota exceeded|too many requests/i.test(msg)) return null
  const retry = msg.match(/retry after ([0-9TZ:.+-]+)/i)?.[1]
  if (retry) {
    const when = new Date(retry)
    const label = Number.isNaN(when.getTime())
      ? retry
      : when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    return `Google API rate limit — wait until about ${label}, then try again. Your account may already be connected; return to Notch and check Apps → Gmail before reconnecting.`
  }
  return 'Google API rate limit — wait a few minutes before reconnecting. Your account may already be connected; check Apps → Gmail in Notch first.'
}

export async function resolveEmailForTokens(
  tokens: Record<string, unknown>
): Promise<string> {
  const fromJwt = emailFromIdToken(tokens.id_token)
  if (fromJwt) return fromJwt

  const { markGoogleRateLimited, googleApiBlockedMessage } = await import('./googleRateLimit')
  const blocked = googleApiBlockedMessage()
  if (blocked) throw new Error(blocked)

  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(tokens)
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  try {
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const email = profile.data.emailAddress
    if (!email) throw new Error('Could not resolve Gmail account email')
    return email
  } catch (err) {
    markGoogleRateLimited(err)
    const friendly = formatGoogleRateLimitError(err)
    if (friendly) throw new Error(friendly)
    throw err
  }
}

function isInvalidGrantError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /invalid_grant|token has been expired|token has been revoked/i.test(msg)
}

export function purgeLegacyGmailToken(sessionId?: string): void {
  const sid = resolveSessionId(sessionId)
  session.setToken(sid, 'gmail', null)
  writeStore(sid, [])
}

export async function migrateLegacyGmailToken(sid: string): Promise<GmailAccountRecord[]> {
  const existing = readStore(sid)
  if (existing.length > 0) return existing

  const legacy = session.getToken(sid, 'gmail') as Record<string, unknown> | null
  if (!legacy) return []

  const email =
    emailFromIdToken(legacy.id_token) ??
    (typeof legacy.email === 'string' ? legacy.email.trim() : null)

  if (!email) {
    console.warn('[gmail] legacy token missing email — purge and reconnect with current scopes')
    purgeLegacyGmailToken(sid)
    return []
  }

  try {
    const account: GmailAccountRecord = {
      id: accountIdForEmail(email),
      email,
      tokens: legacy,
      feedEnabled: true,
      calendarEnabled: true,
      addedAt: Date.now()
    }
    writeStore(sid, [account])
    return [account]
  } catch (err) {
    if (isInvalidGrantError(err)) {
      purgeLegacyGmailToken(sid)
      const { setConnection } = await import('../store')
      setConnection('gmail', false)
    }
    console.warn('[gmail] legacy token migration skipped:', err)
    return []
  }
}

export async function listGmailAccounts(sessionId?: string): Promise<GmailAccountRecord[]> {
  const sid = resolveSessionId(sessionId)
  const accounts = readStore(sid)
  if (accounts.length > 0) return accounts
  return migrateLegacyGmailToken(sid)
}

/** Save Gmail OAuth tokens without calling Google APIs (safe during rate limits). */
export async function upsertGmailAccount(
  tokens: Record<string, unknown>,
  sessionId?: string
): Promise<GmailAccountRecord> {
  const sid = resolveSessionId(sessionId)
  const email =
    emailFromIdToken(tokens.id_token) ??
    (typeof tokens.email === 'string' ? tokens.email.trim() : '')
  if (!email) {
    throw new Error(
      'Gmail authorized but email was not returned — wait for the Google rate limit to clear, then connect again.'
    )
  }
  const id = accountIdForEmail(email)
  const accounts = readStore(sid)
  const existing = accounts.find((a) => a.id === id)

  const next: GmailAccountRecord = {
    id,
    email,
    tokens,
    feedEnabled: existing?.feedEnabled ?? true,
    calendarEnabled: existing?.calendarEnabled ?? true,
    addedAt: existing?.addedAt ?? Date.now()
  }

  const merged = [...accounts.filter((a) => a.id !== id), next].sort(
    (a, b) => a.addedAt - b.addedAt
  )
  writeStore(sid, merged)
  const { setConnection } = await import('../store')
  setConnection('gmail', true)
  return next
}

export async function updateGmailAccount(
  accountId: string,
  patch: { feedEnabled?: boolean; calendarEnabled?: boolean },
  sessionId?: string
): Promise<GmailAccountRecord[]> {
  const sid = resolveSessionId(sessionId)
  const accounts = await listGmailAccounts(sid)
  const updated = accounts.map((a) =>
    a.id === accountId
      ? {
          ...a,
          feedEnabled: patch.feedEnabled ?? a.feedEnabled,
          calendarEnabled: patch.calendarEnabled ?? a.calendarEnabled
        }
      : a
  )
  writeStore(sid, updated)
  return updated
}

export async function removeGmailAccount(
  accountId: string,
  sessionId?: string
): Promise<GmailAccountRecord[]> {
  const sid = resolveSessionId(sessionId)
  const accounts = (await listGmailAccounts(sid)).filter((a) => a.id !== accountId)
  writeStore(sid, accounts)
  return accounts
}

export async function hasGmailAccounts(sessionId?: string): Promise<boolean> {
  return (await listGmailAccounts(sessionId)).length > 0
}

export async function feedEnabledAccounts(sessionId?: string): Promise<GmailAccountRecord[]> {
  return (await listGmailAccounts(sessionId)).filter((a) => a.feedEnabled)
}

/** Desktop fallback when API calls omit session cookies (e.g. Electron main process). */
function scanStoredGmailAccounts(filter: (a: GmailAccountRecord) => boolean): GmailAccountRecord[] {
  if (process.env.VERCEL) return []

  try {
    const { getDb } = require('../db-sqlite') as typeof import('../db-sqlite')
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS session_tokens (
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        token_json TEXT NOT NULL,
        PRIMARY KEY (session_id, source)
      );
    `)

    const rows = getDb()
      .prepare(`SELECT token_json FROM session_tokens WHERE source = ?`)
      .all(STORE_KEY) as { token_json: string }[]

    for (const row of rows) {
      const parsed = JSON.parse(row.token_json) as { accounts?: GmailAccountRecord[] }
      const hit = (parsed.accounts ?? []).filter(filter)
      if (hit.length > 0) return hit
    }

    const legacy = getDb()
      .prepare(`SELECT token_json FROM session_tokens WHERE source = 'gmail'`)
      .all() as { token_json: string }[]
    for (const row of legacy) {
      try {
        const tokens = JSON.parse(row.token_json) as Record<string, unknown>
        const email =
          emailFromIdToken(tokens.id_token) ??
          (typeof tokens.email === 'string' ? tokens.email : null)
        if (!email) continue
        const account: GmailAccountRecord = {
          id: accountIdForEmail(email),
          email,
          tokens,
          feedEnabled: true,
          calendarEnabled: true,
          addedAt: Date.now()
        }
        if (filter(account)) return [account]
      } catch {
        continue
      }
    }
  } catch {
    /* sqlite unavailable in memory mode */
  }
  return []
}

/** Resolve Gmail accounts for background sync (no HTTP session on the stack). */
export async function feedEnabledAccountsAnySession(): Promise<GmailAccountRecord[]> {
  try {
    const current = await feedEnabledAccounts()
    if (current.length > 0) return current
  } catch {
    /* background / timer — fall through to stored tokens */
  }
  return scanStoredGmailAccounts((a) => a.feedEnabled)
}

export async function calendarEnabledAccountsAnySession(): Promise<GmailAccountRecord[]> {
  try {
    const current = await calendarEnabledAccounts()
    if (current.length > 0) return current
  } catch {
    /* background — fall through */
  }
  return scanStoredGmailAccounts((a) => a.calendarEnabled)
}

export async function calendarEnabledAccounts(sessionId?: string): Promise<GmailAccountRecord[]> {
  return (await listGmailAccounts(sessionId)).filter((a) => a.calendarEnabled)
}

export function accountSlug(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

export function toPublicAccount(a: GmailAccountRecord) {
  return {
    id: a.id,
    email: a.email,
    feedEnabled: a.feedEnabled,
    calendarEnabled: a.calendarEnabled,
    addedAt: a.addedAt
  }
}
