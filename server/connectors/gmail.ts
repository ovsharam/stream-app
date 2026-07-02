import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials } from './types'

// Gmail — Google OAuth (gmail.readonly).
// Promotes email into a graph-feeding connector: product announcements,
// release notes, internal product Q&A threads. settings.searchQuery scopes
// what gets ingested (Gmail search syntax) so inboxes don't flood the graph.

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

const DEFAULT_QUERY = '-category:promotions -category:social -in:chats'

async function gmailGet(token: string, path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${GMAIL_BASE}${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 10000))
    return gmailGet(token, path, params)
  }
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

type GmailPart = {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailPart[]
}

/** Walk the MIME tree for the first text/plain body (fall back to text/html, stripped). */
function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return ''
  const findPart = (part: GmailPart, mime: string): string => {
    if (part.mimeType === mime && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8')
    }
    for (const child of part.parts ?? []) {
      const found = findPart(child, mime)
      if (found) return found
    }
    return ''
  }
  const plain = findPart(payload, 'text/plain')
  if (plain) return plain
  const html = findPart(payload, 'text/html')
  if (html) {
    return html
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
  }
  return ''
}

function header(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/** Strip quoted reply chains — they repeat content and bloat extraction. */
function stripQuotedReplies(text: string): string {
  const lines = text.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (/^On .{10,80} wrote:$/.test(line.trim())) break
    if (/^-{3,}\s*Original Message\s*-{3,}/i.test(line.trim())) break
    if (line.trim().startsWith('>')) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

export const gmailConnector: ConnectorImpl = {
  type: 'gmail',
  label: 'Email (Gmail)',
  description: 'Ingests product announcements, release notes, and product Q&A threads from Gmail.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Gmail OAuth error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    if (!creds.refreshToken) throw new Error('No refresh token')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: creds.refreshToken, client_id: clientId,
        client_secret: clientSecret, grant_type: 'refresh_token',
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Gmail refresh error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async validate(creds) {
    try {
      await gmailGet(creds.accessToken ?? '', '/profile')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const sinceDays = since
      ? Math.max(1, Math.ceil((Date.now() - since) / 86400000))
      : 90
    const q = `${settings.searchQuery?.trim() || DEFAULT_QUERY} newer_than:${sinceDays}d`

    let pageToken: string | undefined
    let fetched = 0
    do {
      const params: Record<string, string> = { q, maxResults: '50' }
      if (pageToken) params.pageToken = pageToken

      const list = await gmailGet(token, '/messages', params)
      const messages = (list.messages ?? []) as Array<{ id: string; threadId: string }>
      pageToken = list.nextPageToken as string | undefined

      for (const m of messages) {
        if (fetched >= 300) return  // per-sync cap
        try {
          const full = await gmailGet(token, `/messages/${m.id}`, { format: 'full' })
          const payload = full.payload as (GmailPart & { headers: Array<{ name: string; value: string }> }) | undefined
          if (!payload) continue

          const subject = header(payload.headers ?? [], 'Subject')
          const from = header(payload.headers ?? [], 'From')
          const dateMs = Number(full.internalDate ?? 0)

          const body = stripQuotedReplies(extractBody(payload))
          if (body.length < 150) continue  // skip stubs, confirmations, one-liners

          fetched++
          yield {
            content: `Email: ${subject}\nFrom: ${from}\n\n${body.slice(0, 15000)}`,
            sourceId: `gmail-${m.id}`,
            sourceUrl: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
            title: subject || '(no subject)',
            author: from,
            timestamp: dateMs || undefined,
            contentType: 'message',
          } satisfies ConnectorChunk
        } catch (e) {
          console.warn(`[gmail] message ${m.id} error:`, (e as Error).message)
        }
      }
    } while (pageToken)
  },
}
