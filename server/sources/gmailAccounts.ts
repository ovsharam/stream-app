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

export async function resolveEmailForTokens(
  tokens: Record<string, unknown>
): Promise<string> {
  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(tokens)
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const email = profile.data.emailAddress
  if (!email) throw new Error('Could not resolve Gmail account email')
  return email
}

export async function migrateLegacyGmailToken(sid: string): Promise<GmailAccountRecord[]> {
  const existing = readStore(sid)
  if (existing.length > 0) return existing

  const legacy = session.getToken(sid, 'gmail')
  if (!legacy) return []

  const email = await resolveEmailForTokens(legacy)
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
}

export async function listGmailAccounts(sessionId?: string): Promise<GmailAccountRecord[]> {
  const sid = resolveSessionId(sessionId)
  const accounts = readStore(sid)
  if (accounts.length > 0) return accounts
  return migrateLegacyGmailToken(sid)
}

export async function upsertGmailAccount(
  tokens: Record<string, unknown>,
  sessionId?: string
): Promise<GmailAccountRecord> {
  const sid = resolveSessionId(sessionId)
  const email = await resolveEmailForTokens(tokens)
  const id = accountIdForEmail(email)
  const accounts = await listGmailAccounts(sid)
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
