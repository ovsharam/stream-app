import { google } from 'googleapis'
import type { Server as SocketServer } from 'socket.io'
import { normalizeGmailThread } from '../normalizer'
import { upsertItems, itemExists, getRecentItems } from '../db'
import { streamItemToApi } from '../../shared/serialize'
import type { StreamItem } from '../../shared/types'
import { getOAuth2Client, GOOGLE_SCOPES, authClientForTokens, GOOGLE_REQUEST_OPTS } from './googleOAuth'
import {
  upsertGmailAccount,
  feedEnabledAccounts,
  feedEnabledAccountsAnySession,
  hasGmailAccounts,
  accountSlug,
  purgeLegacyGmailToken,
  type GmailAccountRecord
} from './gmailAccounts'
import {
  googleApiBlockedMessage,
  isGoogleApiBlocked,
  markGoogleRateLimited,
  effectiveGoogleSyncError,
  assertGoogleApiAllowed
} from './googleRateLimit'
import { FEED_HISTORY_DAYS } from '../../shared/feed'

export function getGmailAuthUrl(sessionId: string, addAccount = false): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: addAccount ? 'select_account consent' : 'consent',
    scope: GOOGLE_SCOPES,
    state: sessionId
  })
}

export async function handleGmailCallback(code: string, sessionId: string): Promise<void> {
  const blocked = googleApiBlockedMessage()
  if (blocked) throw new Error(blocked)

  const oauth2 = getOAuth2Client()
  let tokens: Record<string, unknown>
  try {
    const res = await oauth2.getToken(code)
    tokens = res.tokens as Record<string, unknown>
  } catch (err) {
    markGoogleRateLimited(err, 'gmail.oauth')
    const retryMsg = googleApiBlockedMessage()
    throw new Error(retryMsg ?? (err instanceof Error ? err.message : String(err)))
  }

  purgeLegacyGmailToken(sessionId)
  await upsertGmailAccount(tokens, sessionId)
}

function isTransientGoogleError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed/i.test(msg)
}

async function withGoogleRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (!isTransientGoogleError(err)) throw err
    console.warn(`[gmail] transient error (${label}), retrying once:`, err instanceof Error ? err.message : err)
    await new Promise((r) => setTimeout(r, 400))
    return fn()
  }
}

async function fetchGmailThreadsForAccount(
  account: GmailAccountRecord,
  limit = 8
): Promise<{ items: StreamItem[]; threadErrors: string[] }> {
  assertGoogleApiAllowed(`gmail.threads:${account.email}`)
  const oauth2 = getOAuth2Client()
  oauth2.setCredentials(account.tokens)
  const gmail = google.gmail({ version: 'v1', auth: oauth2 })

  const listRes = await withGoogleRetry(`threads.list:${account.email}`, () =>
    gmail.users.threads.list(
      {
        userId: 'me',
        maxResults: limit,
        q: `in:inbox -category:promotions -category:social newer_than:${FEED_HISTORY_DAYS}d`
      },
      GOOGLE_REQUEST_OPTS
    )
  )

  const items: StreamItem[] = []
  const threadErrors: string[] = []
  const slug = accountSlug(account.email)

  for (const thread of listRes.data.threads ?? []) {
    if (!thread.id) continue

    try {
      const detail = await withGoogleRetry(`threads.get:${thread.id}`, () =>
        gmail.users.threads.get(
          {
            userId: 'me',
            id: thread.id!,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date']
          },
          GOOGLE_REQUEST_OPTS
        )
      )

      const messages = detail.data.messages ?? []
      const latest = messages[messages.length - 1]
      if (!latest) continue

      const headers = latest.payload?.headers ?? []
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value

      const fromRaw = getHeader('From') ?? ''
      const fromMatch = fromRaw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/)
      const from = {
        name: fromMatch?.[1]?.trim() || fromRaw,
        email: fromMatch?.[2]?.trim() || fromRaw
      }

      const normalized = normalizeGmailThread({
        id: `${slug}-${thread.id}`,
        snippet: detail.data.snippet ?? thread.snippet ?? undefined,
        subject: getHeader('Subject') ?? undefined,
        from,
        date: new Date(parseInt(latest.internalDate ?? '0', 10)),
        body: detail.data.snippet ?? thread.snippet ?? '',
        labelIds: latest.labelIds ?? undefined,
        metadata: {
          threadId: thread.id,
          accountEmail: account.email,
          accountId: account.id,
          messageCount: messages.length
        }
      })

      if (normalized) items.push(normalized)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      threadErrors.push(`${thread.id}: ${message}`)
      console.warn('[gmail] thread fetch skipped', account.email, thread.id, message)
    }
  }

  return { items, threadErrors }
}

let lastGmailSuccessAt = 0

export function getLastGmailSyncAt(): number {
  return lastGmailSuccessAt
}

let lastGmailError: string | null = null

export function clearLastGmailError(): void {
  lastGmailError = null
}

export function getLastGmailError(): string | null {
  return effectiveGoogleSyncError(lastGmailError)
}

export function googleApiNeedsEnable(error: string | null): boolean {
  if (!error) return false
  return /has not been used|is disabled|accessNotConfigured|403/i.test(error)
}

export function googleApiEnableUrl(error: string | null): string | null {
  if (!error) return null
  if (/calendar/i.test(error)) {
    return 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'
  }
  if (/gmail/i.test(error)) {
    return 'https://console.cloud.google.com/apis/library/gmail.googleapis.com'
  }
  if (/people|contacts/i.test(error)) {
    return 'https://console.cloud.google.com/apis/library/people.googleapis.com'
  }
  return 'https://console.cloud.google.com/apis/dashboard'
}

export async function syncGmail(io?: SocketServer): Promise<StreamItem[]> {
  const blocked = googleApiBlockedMessage()
  if (blocked) {
    lastGmailError = blocked
    return []
  }

  const accounts = await feedEnabledAccountsAnySession()
  if (accounts.length === 0) return []

  const allItems: StreamItem[] = []
  const errors: string[] = []

  for (const account of accounts) {
    try {
      const { items, threadErrors } = await fetchGmailThreadsForAccount(account, 50)
      allItems.push(...items)
      if (threadErrors.length > 0) {
        errors.push(`${account.email}: ${threadErrors.length} thread(s) skipped`)
      }
    } catch (err) {
      markGoogleRateLimited(err, 'gmail.sync')
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${account.email}: ${message}`)
      console.error('[gmail] sync failed for', account.email, err)
      if (/invalid_grant|token has been expired|token has been revoked/i.test(message)) {
        try {
          const { removeGmailAccount } = await import('./gmailAccounts')
          await removeGmailAccount(account.id)
          const { setConnection } = await import('../store')
          setConnection('gmail', false)
          console.warn('[gmail] removed revoked account', account.email)
        } catch {
          /* best effort */
        }
      }
    }
  }

  if (allItems.length > 0) {
    const newItems = allItems.filter((i) => !itemExists(i.id))
    const updatedCount = allItems.length - newItems.length
    upsertItems(allItems)
    lastGmailSuccessAt = Date.now()
    for (const item of newItems) {
      io?.emit('stream:item', streamItemToApi(item))
    }
    if (updatedCount > 0) {
      io?.emit('stream:update', { source: 'gmail', count: updatedCount })
    }
  }

  // Calendar sync is handled separately via /cluster/calendar (cached) — avoid doubling API calls.

  if (errors.length > 0 && allItems.length === 0) {
    lastGmailError = errors.join(' · ')
  } else {
    lastGmailError = errors.length > 0 ? errors.join(' · ') : null
  }

  return allItems
}

function parseFromHeader(raw: string): { name: string; email: string } {
  const fromMatch = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/)
  return {
    name: fromMatch?.[1]?.trim() || raw,
    email: fromMatch?.[2]?.trim() || raw
  }
}

function extractPlainBody(payload: { parts?: { mimeType?: string | null; body?: { data?: string | null } | null }[] | null; body?: { data?: string | null } | null } | null | undefined): string {
  const parts = payload?.parts ?? []
  const plain = parts.find((p) => p.mimeType === 'text/plain')
  if (plain?.body?.data) {
    return Buffer.from(plain.body.data, 'base64').toString('utf-8')
  }
  if (payload?.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  return ''
}

export async function getGmailThreadContext(input: {
  streamItemId?: string
  threadId?: string
  accountId?: string
}): Promise<{
  threadId: string
  subject: string
  accountId: string
  accountEmail: string
  gmailUrl: string
  messages: { id: string; ts: number; actor: string; body: string }[]
} | null> {
  let threadId = input.threadId
  let accountId = input.accountId

  if (input.streamItemId) {
    const item = getRecentItems(500).find((i) => i.id === input.streamItemId)
    if (item?.source === 'gmail') {
      threadId = String(item.metadata?.threadId ?? threadId ?? '')
      accountId = String(item.metadata?.accountId ?? accountId ?? '')
    }
  }

  if (!threadId) return null

  const { gmail, account } = await gmailClientForAccount(accountId)
  const detail = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full'
  })

  const rawMessages = detail.data.messages ?? []
  if (rawMessages.length === 0) return null

  const messages = rawMessages.map((msg) => {
    const headers = msg.payload?.headers ?? []
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
    const from = parseFromHeader(getHeader('From'))
    const rawBody = extractPlainBody(msg.payload).trim() || (detail.data.snippet ?? '')
    const body = rawBody
      .replace(/\[image:\s*[^\]]*\]/gi, '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    return {
      id: msg.id ?? `${threadId}-${msg.internalDate ?? '0'}`,
      ts: parseInt(msg.internalDate ?? '0', 10),
      actor: from.name || from.email,
      body
    }
  })

  const firstHeaders = rawMessages[0]?.payload?.headers ?? []
  const subject =
    firstHeaders.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '(no subject)'

  return {
    threadId,
    subject,
    accountId: account.id,
    accountEmail: account.email,
    gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
    messages
  }
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET)
}

export async function isGmailConnected(): Promise<boolean> {
  return (await feedEnabledAccountsAnySession()).length > 0
}

function encodeEmailBody(body: string): string {
  return Buffer.from(body).toString('base64url')
}

async function gmailClientForAccount(accountId?: string) {
  const accounts = await feedEnabledAccountsAnySession()
  const account =
    (accountId ? accounts.find((a) => a.id === accountId) : null) ?? accounts[0]
  if (!account) throw new Error('No Gmail account available')
  const oauth2 = authClientForTokens(account.tokens)
  return { gmail: google.gmail({ version: 'v1', auth: oauth2 }), account }
}

export async function replyToGmailThread(input: {
  threadId: string
  accountId?: string
  body: string
}): Promise<{ id: string }> {
  const { gmail, account } = await gmailClientForAccount(input.accountId)
  const thread = await gmail.users.threads.get({ userId: 'me', id: input.threadId, format: 'metadata' })
  const last = thread.data.messages?.at(-1)
  if (!last?.id) throw new Error('Thread has no messages')

  const headers = last.payload?.headers ?? []
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
  const subject = getHeader('Subject').startsWith('Re:')
    ? getHeader('Subject')
    : `Re: ${getHeader('Subject') || '(no subject)'}`
  const to = getHeader('Reply-To') || getHeader('From')
  if (!to) throw new Error('Could not resolve reply recipient')

  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${getHeader('Message-ID')}`,
    `References: ${getHeader('Message-ID')}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    input.body.trim()
  ].join('\r\n')

  const sent = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      threadId: input.threadId,
      raw: encodeEmailBody(raw)
    }
  })

  if (!sent.data.id) throw new Error('Gmail did not return message id')
  return { id: sent.data.id }
}

export async function sendGmailMessage(input: {
  to: string
  subject: string
  body: string
  accountId?: string
}): Promise<{ id: string }> {
  const { gmail } = await gmailClientForAccount(input.accountId)
  const raw = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    input.body.trim()
  ].join('\r\n')

  const sent = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodeEmailBody(raw) }
  })
  if (!sent.data.id) throw new Error('Gmail did not return message id')
  return { id: sent.data.id }
}
