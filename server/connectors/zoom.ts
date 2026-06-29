import type { ConnectorImpl } from './types'

// Zoom OAuth 2.0 — Server-to-Server OAuth or User OAuth
// Meeting transcripts via Cloud Recording API + VTT file download
const BASE = 'https://api.zoom.us/v2'
const TOKEN_URL = 'https://zoom.us/oauth/token'

async function zoomFetch(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 30)
    await new Promise(r => setTimeout(r, retry * 1000))
    return zoomFetch(token, path)
  }
  if (!res.ok) throw new Error(`Zoom ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

async function downloadVtt(url: string, token: string): Promise<string> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return ''
  return res.text()
}

function parseVtt(vtt: string): string {
  // Extract text lines, skip timestamps and WEBVTT header
  return vtt
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed === 'WEBVTT') return false
      if (/^\d+$/.test(trimmed)) return false  // cue number
      if (/^\d{2}:\d{2}/.test(trimmed)) return false  // timestamp
      return true
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const zoomConnector: ConnectorImpl = {
  type: 'zoom',
  label: 'Zoom',
  description: 'Indexes meeting transcripts from recorded Zoom calls to extract product insights.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    return `https://zoom.us/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Zoom OAuth error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: creds.refreshToken ?? '' }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Zoom refresh error: ${data.error}`)
    return {
      accessToken: String(data.access_token),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async validate(creds) {
    try {
      await zoomFetch(creds.accessToken ?? '', '/users/me')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const from = since
      ? new Date(since).toISOString().split('T')[0]
      : new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
    const to = new Date().toISOString().split('T')[0]

    // Get current user
    let userId = 'me'
    try {
      const me = await zoomFetch(token, '/users/me') as { id?: string }
      userId = me.id ?? 'me'
    } catch { /* use me */ }

    let nextToken: string | undefined
    do {
      const qs = `from=${from}&to=${to}&type=cloud_recordings&page_size=30${nextToken ? `&next_page_token=${nextToken}` : ''}`
      const data = await zoomFetch(token, `/users/${userId}/recordings?${qs}`)
      const meetings = (data.meetings ?? []) as Array<{
        id: string | number; topic: string; start_time: string
        recording_files?: Array<{ file_type: string; download_url: string; status: string }>
      }>
      nextToken = data.next_page_token as string | undefined

      for (const meeting of meetings) {
        const vttFile = meeting.recording_files?.find(f => f.file_type === 'TRANSCRIPT' && f.status === 'completed')
        if (!vttFile) continue

        try {
          const raw = await downloadVtt(vttFile.download_url, token)
          const text = parseVtt(raw)
          if (text.length < 200) continue

          yield {
            content: `Meeting: ${meeting.topic}\n\n${text}`.slice(0, 25000),
            sourceId: `zoom-${meeting.id}`,
            title: meeting.topic,
            timestamp: new Date(meeting.start_time).getTime(),
            contentType: 'transcript' as const,
          }
        } catch (e) {
          console.warn(`[zoom] transcript error ${meeting.id}:`, (e as Error).message)
        }
      }
    } while (nextToken)
  },
}
