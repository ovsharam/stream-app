import { App } from '@slack/bolt'
import type { Server as SocketServer } from 'socket.io'
import { normalizeSlackMessage } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'
import { FEED_HISTORY_DAYS } from '../../shared/feed'

let boltApp: App | null = null

export function getSlackAuthUrl(): string {
  const clientId = process.env.SLACK_CLIENT_ID
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const redirectUri =
    process.env.SLACK_REDIRECT_URI || `${base}/api/auth/slack/callback`
  const scopes = [
    'channels:history',
    'groups:history',
    'im:history',
    'mpim:history',
    'users:read',
    'channels:read',
    'chat:write',
    'chat:write.public'
  ].join(',')

  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`
}

export async function handleSlackCallback(code: string): Promise<void> {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  const redirectUri =
    process.env.SLACK_REDIRECT_URI || `${base}/api/auth/slack/callback`

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId ?? '',
      client_secret: clientSecret ?? '',
      code,
      redirect_uri: redirectUri
    })
  })

  const data = (await res.json()) as {
    ok: boolean
    access_token?: string
    authed_user?: { access_token?: string }
    team?: { id: string; name: string }
    error?: string
  }

  if (!data.ok || !data.access_token) {
    throw new Error(data.error ?? 'Slack OAuth failed')
  }

  setToken('slack', {
    botToken: data.access_token,
    userToken: data.authed_user?.access_token,
    teamId: data.team?.id,
    teamName: data.team?.name
  })
  setConnection('slack', true)
}

async function slackApi(method: string, token: string, params: Record<string, string> = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  })
  return res.json()
}

export async function fetchSlackMessages(hours = 24): Promise<StreamItem[]> {
  const tokens = getToken('slack')
  const token = (tokens?.botToken ?? tokens?.userToken) as string | undefined
  if (!token) return []

  const oldest = String(Math.floor(Date.now() / 1000) - hours * 3600)
  const channelsRes = (await slackApi('conversations.list', token, {
    types: 'public_channel,private_channel,im',
    limit: '50'
  })) as { ok: boolean; channels?: { id: string; name?: string }[] }

  if (!channelsRes.ok || !channelsRes.channels) return []

  const items: StreamItem[] = []
  const userCache = new Map<string, { name: string; id: string; avatar?: string }>()

  for (const channel of channelsRes.channels.slice(0, 15)) {
    const history = (await slackApi('conversations.history', token, {
      channel: channel.id,
      oldest,
      limit: '50'
    })) as {
      ok: boolean
      messages?: {
        ts: string
        user?: string
        text?: string
        bot_id?: string
        subtype?: string
      }[]
    }

    if (!history.ok || !history.messages) continue

    for (const msg of history.messages) {
      if (msg.bot_id || msg.subtype === 'bot_message') continue
      if (!msg.text) continue

      let user: { name: string; id: string; avatar?: string } = {
        name: 'Unknown',
        id: msg.user ?? ''
      }
      if (msg.user && !userCache.has(msg.user)) {
        const info = (await slackApi('users.info', token, { user: msg.user })) as {
          ok: boolean
          user?: { real_name?: string; name?: string; profile?: { image_48?: string } }
        }
        if (info.ok && info.user) {
          user = {
            name: info.user.real_name ?? info.user.name ?? 'Unknown',
            id: msg.user,
            avatar: info.user.profile?.image_48
          }
          userCache.set(msg.user, user)
        }
      } else if (msg.user) {
        user = { ...userCache.get(msg.user)!, id: msg.user }
      }

      const normalized = normalizeSlackMessage({
        ts: msg.ts,
        channel: channel.id,
        channelName: channel.name,
        user,
        text: msg.text
      })
      items.push(normalized)
    }
  }

  return items
}

export async function syncSlack(io?: SocketServer): Promise<StreamItem[]> {
  if (!getToken('slack')) return []

  try {
    const items = await fetchSlackMessages(FEED_HISTORY_DAYS * 24)
    const newItems = items.filter((i) => !itemExists(i.id))

    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)

    return items
  } catch (err) {
    console.error('[slack] sync failed:', err)
    return []
  }
}

export async function startSlackSocketMode(io: SocketServer): Promise<void> {
  const appToken = process.env.SLACK_APP_TOKEN
  const tokens = getToken('slack')
  const botToken = tokens?.botToken as string | undefined

  if (!appToken || !botToken || boltApp) return

  boltApp = new App({
    token: botToken,
    appToken,
    socketMode: true
  })

  boltApp.event('message', async ({ event, say: _say }) => {
    if (event.subtype || ('bot_id' in event && event.bot_id)) return
    if (!('text' in event) || !event.text) return

    const normalized = normalizeSlackMessage({
      ts: event.ts,
      channel: event.channel,
      user: { name: 'Slack User', id: 'user' in event ? String(event.user) : '' },
      text: event.text
    })

    if (!itemExists(normalized.id)) {
      upsertItem(normalized)
      io.emit('stream:item', normalized)
    }
  })

  await boltApp.start()
  console.log('[slack] Socket Mode connected')
}

export function isSlackConfigured(): boolean {
  return !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET)
}

export function isSlackConnected(): boolean {
  return !!getToken('slack')
}

export async function resolveSlackChannel(nameOrId: string): Promise<string> {
  const tokens = getToken('slack')
  const token = (tokens?.botToken ?? tokens?.userToken) as string | undefined
  if (!token) throw new Error('Slack not connected')

  if (/^[CDG][A-Z0-9]+$/i.test(nameOrId)) return nameOrId

  const needle = nameOrId.replace(/^#/, '').toLowerCase()
  const channelsRes = (await slackApi('conversations.list', token, {
    types: 'public_channel,private_channel',
    limit: '200'
  })) as { ok: boolean; channels?: { id: string; name?: string }[] }

  if (!channelsRes.ok || !channelsRes.channels) throw new Error('Could not list Slack channels')
  const hit =
    channelsRes.channels.find((c) => c.name?.toLowerCase() === needle) ??
    channelsRes.channels.find((c) => c.name?.toLowerCase().includes(needle))
  if (!hit?.id) throw new Error(`Slack channel not found: ${nameOrId}`)
  return hit.id
}

export async function sendSlackMessage(input: {
  channel: string
  text: string
  threadTs?: string
}): Promise<{ ts: string; channel: string }> {
  const tokens = getToken('slack')
  const token = (tokens?.botToken ?? tokens?.userToken) as string | undefined
  if (!token) throw new Error('Slack not connected')

  const channel = await resolveSlackChannel(input.channel)
  const params: Record<string, string> = {
    channel,
    text: input.text.trim()
  }
  if (input.threadTs) params.thread_ts = input.threadTs

  const res = (await slackApi('chat.postMessage', token, params)) as {
    ok: boolean
    ts?: string
    channel?: string
    error?: string
  }
  if (!res.ok || !res.ts) throw new Error(res.error ?? 'Slack post failed')
  return { ts: res.ts, channel: res.channel ?? channel }
}
