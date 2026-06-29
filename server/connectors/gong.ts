import type { ConnectorImpl } from './types'

// Gong uses OAuth 2.0 (client credentials or authorization_code)
// API docs: https://us-34257.api.gong.io/v2
// Transcripts reveal product objections, competitor mentions, feature requests

const BASE = 'https://api.gong.io/v2'

async function gongFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 30)
    await new Promise(r => setTimeout(r, retry * 1000))
    return gongFetch(token, path, method, body)
  }
  if (!res.ok) throw new Error(`Gong ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

const GONG_TOKEN_URL = 'https://app.gong.io/oauth2/generate-customer-token'

export const gongConnector: ConnectorImpl = {
  type: 'gong',
  label: 'Gong',
  description: 'Indexes call transcripts to surface product objections, feature requests, and competitive intel.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    return `https://app.gong.io/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(GONG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Gong OAuth error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    const res = await fetch(GONG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken ?? '',
        client_id: clientId, client_secret: clientSecret,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Gong refresh error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async validate(creds) {
    try {
      await gongFetch(creds.accessToken ?? '', '/users/me')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const fromDateTime = since
      ? new Date(since).toISOString()
      : new Date(Date.now() - 90 * 86400000).toISOString()

    // List calls
    let cursor: string | undefined
    do {
      const body: Record<string, unknown> = {
        filter: { fromDateTime },
        contentSelector: { exposedFields: { parties: true } },
      }
      if (cursor) body.cursor = cursor

      const data = await gongFetch(token, '/calls/extensive', 'POST', body)
      const calls = (data.calls ?? []) as Array<{
        metaData: { id: string; title?: string; started?: string; duration?: number }
        parties?: Array<{ name: string; affiliation: string }>
      }>
      cursor = data.nextPageCursor as string | undefined

      for (const call of calls) {
        const { metaData } = call
        if (!metaData?.id) continue

        // Fetch transcript
        try {
          const txData = await gongFetch(token, `/calls/${metaData.id}/transcript`)
          const transcript = txData.transcript as Array<{
            speakerId: string; topic?: string
            sentences: Array<{ start: number; end: number; text: string }>
          }> | undefined

          if (!transcript || transcript.length === 0) continue

          const lines: string[] = []
          const parties = (call.parties ?? []).reduce<Record<string, string>>((acc, p) => {
            acc[p.name] = p.affiliation
            return acc
          }, {})

          for (const turn of transcript) {
            const speakerLines = turn.sentences.map(s => s.text).join(' ')
            if (speakerLines.trim().length < 20) continue
            lines.push(speakerLines)
          }

          if (lines.length === 0) continue

          const title = metaData.title || `Gong call ${metaData.id}`
          const header = `Call: ${title}`
          const participantInfo = Object.entries(parties)
            .map(([name, aff]) => `${name} (${aff})`).join(', ')
          const content = [header, participantInfo ? `Participants: ${participantInfo}` : '', '', lines.join('\n')].filter(Boolean).join('\n').trim()

          if (content.length < 200) continue

          yield {
            content: content.slice(0, 25000),
            sourceId: `gong-${metaData.id}`,
            title,
            timestamp: metaData.started ? new Date(metaData.started).getTime() : undefined,
            contentType: 'transcript' as const,
          }
        } catch (e) {
          console.warn(`[gong] transcript error ${metaData.id}:`, (e as Error).message)
        }
      }
    } while (cursor)
  },
}
