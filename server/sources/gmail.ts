import { google } from 'googleapis'
import type { Server as SocketServer } from 'socket.io'
import { normalizeGmailThread } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
]

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID
  const clientSecret = process.env.GMAIL_CLIENT_SECRET
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI || `${base}/api/auth/gmail/callback`

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth credentials not configured')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function getGmailAuthUrl(): string {
  const oauth2 = getOAuth2Client()
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  })
}

export async function handleGmailCallback(code: string): Promise<void> {
  const oauth2 = getOAuth2Client()
  const { tokens } = await oauth2.getToken(code)
  setToken('gmail', tokens as Record<string, unknown>)
  setConnection('gmail', true)
}

function getAuthenticatedClient() {
  const oauth2 = getOAuth2Client()
  const tokens = getToken('gmail')
  if (!tokens) throw new Error('Gmail not connected')
  oauth2.setCredentials(tokens)
  return oauth2
}

export async function fetchGmailThreads(limit = 50): Promise<StreamItem[]> {
  const auth = getAuthenticatedClient()
  const gmail = google.gmail({ version: 'v1', auth })

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    maxResults: limit,
    q: 'in:inbox -category:promotions -category:social'
  })

  const items: StreamItem[] = []

  for (const thread of listRes.data.threads ?? []) {
    if (!thread.id) continue
    const detail = await gmail.users.threads.get({
      userId: 'me',
      id: thread.id,
      format: 'full'
    })

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

    let body = ''
    const parts = latest.payload?.parts ?? []
    const plain = parts.find((p) => p.mimeType === 'text/plain')
    if (plain?.body?.data) {
      body = Buffer.from(plain.body.data, 'base64').toString('utf-8')
    } else if (latest.payload?.body?.data) {
      body = Buffer.from(latest.payload.body.data, 'base64').toString('utf-8')
    }

    const normalized = normalizeGmailThread({
      id: thread.id,
      snippet: detail.data.snippet ?? undefined,
      subject: getHeader('Subject') ?? undefined,
      from,
      date: new Date(parseInt(latest.internalDate ?? '0', 10)),
      body,
      labelIds: latest.labelIds ?? undefined
    })

    if (normalized) items.push(normalized)
  }

  return items
}

export async function syncGmail(io?: SocketServer): Promise<StreamItem[]> {
  if (!getToken('gmail')) return []

  try {
    const items = await fetchGmailThreads(50)
    const newItems = items.filter((i) => !itemExists(i.id))
    upsertItems(items)

    for (const item of newItems) {
      io?.emit('stream:item', item)
    }

    return items
  } catch (err) {
    console.error('[gmail] sync failed:', err)
    return []
  }
}

export function isGmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET)
}

export function isGmailConnected(): boolean {
  return !!getToken('gmail')
}
