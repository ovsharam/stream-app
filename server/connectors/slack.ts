import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Uses Slack Web API directly with Bearer token (bot token from OAuth)
const BASE = 'https://slack.com/api'

async function slackGet(token: string, method: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/${method}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 30)
    await new Promise(r => setTimeout(r, retry * 1000))
    return slackGet(token, method, params)
  }
  const data = await res.json() as Record<string, unknown>
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
  return data
}

export const slackConnector: ConnectorImpl = {
  type: 'slack',
  label: 'Slack',
  description: 'Indexes messages from product and engineering channels to surface product knowledge.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    const scopes = [
      'channels:read', 'channels:history',
      'groups:read', 'groups:history',
      'users:read',
    ].join(',')
    return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const res = await fetch(`${BASE}/oauth.v2.access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
    })
    const data = await res.json() as Record<string, unknown>
    if (!data.ok) throw new Error(`Slack OAuth error: ${data.error}`)
    return {
      accessToken: (data.access_token as string) ?? ((data as Record<string, Record<string,string>>).authed_user?.access_token),
      tokenType: 'bot',
    }
  },

  async validate(creds) {
    try {
      const token = creds.accessToken ?? ''
      await slackGet(token, 'auth.test')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const targetChannels = (settings.channels ?? []).map(c => c.replace('#', '').toLowerCase())

    // Resolve channel names → IDs
    let channelIds: Array<{ id: string; name: string }> = []
    try {
      const data = await slackGet(token, 'conversations.list', { types: 'public_channel,private_channel', limit: '200' })
      const all = (data.channels as Array<{ id: string; name: string }>) ?? []
      channelIds = targetChannels.length > 0
        ? all.filter(c => targetChannels.includes(c.name.toLowerCase()))
        : all.filter(c => ['product', 'engineering', 'releases', 'ship-it', 'eng', 'product-eng'].includes(c.name.toLowerCase()))
    } catch (e) {
      console.warn('[slack] channels.list error:', (e as Error).message)
      return
    }

    const oldest = since ? String(since / 1000) : String(Date.now() / 1000 - 90 * 86400)  // default: 90 days

    for (const channel of channelIds) {
      let cursor: string | undefined
      do {
        try {
          const params: Record<string, string> = { channel: channel.id, limit: '200', oldest }
          if (cursor) params.cursor = cursor

          const data = await slackGet(token, 'conversations.history', params)
          const messages = (data.messages as Array<{
            ts: string; text: string; user?: string; thread_ts?: string; reply_count?: number; subtype?: string
          }>) ?? []

          cursor = (data.response_metadata as Record<string, string> | undefined)?.next_cursor

          for (const msg of messages) {
            if (msg.subtype) continue  // skip join/leave/bot messages
            if (!msg.text || msg.text.length < 100) continue  // skip short messages

            const threadContent: string[] = [`[#${channel.name}] ${msg.text}`]

            // Fetch thread replies if any
            if (msg.thread_ts && msg.reply_count && msg.reply_count > 0) {
              try {
                const threadData = await slackGet(token, 'conversations.replies', {
                  channel: channel.id, ts: msg.thread_ts, limit: '50',
                })
                const replies = (threadData.messages as Array<{ ts: string; text: string; user?: string }>) ?? []
                for (const reply of replies.slice(1)) {  // skip parent
                  if (reply.text && reply.text.length > 20) {
                    threadContent.push(`  ↳ ${reply.text}`)
                  }
                }
              } catch { /* skip thread fetch errors */ }
            }

            yield {
              content: threadContent.join('\n'),
              sourceId: `slack-${channel.id}-${msg.ts}`,
              sourceUrl: undefined,
              title: `#${channel.name}`,
              author: msg.user,
              timestamp: Math.round(Number(msg.ts) * 1000),
              contentType: 'message' as const,
            }
          }
        } catch (e) {
          console.warn(`[slack] history error ${channel.name}:`, (e as Error).message)
          break
        }
      } while (cursor)
    }
  },
}
