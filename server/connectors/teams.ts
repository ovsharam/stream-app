import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials } from './types'

// Microsoft Teams — Graph API OAuth.
// Extracts channel messages (+ replies) from joined teams, same shape as the
// Slack connector: product/engineering channels are where workarounds and
// feature updates get discussed before they ever reach documentation.

const GRAPH = 'https://graph.microsoft.com/v1.0'
const AUTH_HOST = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const SCOPES = 'ChannelMessage.Read.All Team.ReadBasic.All Channel.ReadBasic.All offline_access'

const DEFAULT_CHANNELS = ['product', 'engineering', 'releases', 'ship-it', 'eng', 'product-eng', 'general']

async function graphGet(token: string, path: string): Promise<Record<string, unknown>> {
  const url = path.startsWith('https://') ? path : `${GRAPH}${path}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 10)
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    return graphGet(token, path)
  }
  if (!res.ok) throw new Error(`Graph ${res.status}: ${path.slice(0, 120)}`)
  return res.json() as Promise<Record<string, unknown>>
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type GraphMessage = {
  id: string
  createdDateTime?: string
  body?: { content?: string; contentType?: string }
  from?: { user?: { displayName?: string } }
  webUrl?: string
}

function messageText(msg: GraphMessage): string {
  const raw = msg.body?.content ?? ''
  return msg.body?.contentType === 'html' ? stripHtml(raw) : raw.trim()
}

export const teamsConnector: ConnectorImpl = {
  type: 'teams',
  label: 'Microsoft Teams',
  description: 'Syncs product and engineering channel discussions from Microsoft Teams.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      response_mode: 'query',
      state,
    })
    return `${AUTH_HOST}/authorize?${params}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(`${AUTH_HOST}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, scope: SCOPES,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Teams OAuth error: ${data.error_description ?? data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? ''),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async refreshAccessToken(creds, clientId, clientSecret) {
    if (!creds.refreshToken) throw new Error('No refresh token')
    const res = await fetch(`${AUTH_HOST}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refreshToken,
        client_id: clientId, client_secret: clientSecret, scope: SCOPES,
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Teams refresh error: ${data.error_description ?? data.error}`)
    return {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? creds.refreshToken),
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    }
  },

  async validate(creds) {
    try {
      await graphGet(creds.accessToken ?? '', '/me/joinedTeams?$top=1')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const sinceMs = since ?? Date.now() - 90 * 86400000

    const teamsData = await graphGet(token, '/me/joinedTeams')
    let teams = (teamsData.value ?? []) as Array<{ id: string; displayName: string }>
    if (settings.teamNames?.length) {
      const wanted = settings.teamNames.map(n => n.toLowerCase())
      teams = teams.filter(t => wanted.includes(t.displayName.toLowerCase()))
    }

    const wantedChannels = settings.channels?.length
      ? settings.channels.map(c => c.toLowerCase())
      : DEFAULT_CHANNELS

    for (const team of teams) {
      let channels: Array<{ id: string; displayName: string }>
      try {
        const chData = await graphGet(token, `/teams/${team.id}/channels`)
        channels = ((chData.value ?? []) as Array<{ id: string; displayName: string }>)
          .filter(c => wantedChannels.includes(c.displayName.toLowerCase()))
      } catch (e) {
        console.warn(`[teams] channels error ${team.displayName}:`, (e as Error).message)
        continue
      }

      for (const channel of channels) {
        let url: string | undefined = `/teams/${team.id}/channels/${channel.id}/messages?$top=50`
        let pages = 0
        while (url && pages < 6) {
          pages++
          let data: Record<string, unknown>
          try {
            data = await graphGet(token, url)
          } catch (e) {
            console.warn(`[teams] messages error ${channel.displayName}:`, (e as Error).message)
            break
          }
          url = data['@odata.nextLink'] as string | undefined
          const messages = (data.value ?? []) as GraphMessage[]

          let sawOld = false
          for (const msg of messages) {
            const ts = msg.createdDateTime ? new Date(msg.createdDateTime).getTime() : 0
            if (ts && ts < sinceMs) { sawOld = true; continue }

            const text = messageText(msg)
            if (text.length < 100) continue

            const threadContent = [`[${team.displayName} / ${channel.displayName}] ${text}`]

            // Pull replies — Teams threads are where the actual answer lives
            try {
              const repliesData = await graphGet(
                token,
                `/teams/${team.id}/channels/${channel.id}/messages/${msg.id}/replies?$top=25`
              )
              for (const reply of (repliesData.value ?? []) as GraphMessage[]) {
                const rText = messageText(reply)
                if (rText.length > 20) threadContent.push(`  ↳ ${rText}`)
              }
            } catch { /* replies optional */ }

            yield {
              content: threadContent.join('\n'),
              sourceId: `teams-${channel.id}-${msg.id}`,
              sourceUrl: msg.webUrl,
              title: `${team.displayName} / ${channel.displayName}`,
              author: msg.from?.user?.displayName,
              timestamp: ts || undefined,
              contentType: 'message',
            } satisfies ConnectorChunk
          }
          if (sawOld) break  // messages come newest-first; stop paging once past `since`
        }
      }
    }
  },
}
