import type { Server as SocketServer } from 'socket.io'
import { normalizeDiscordMessage } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'

type DiscordToken = {
  token: string
  channelIds: string[]
}

function getDiscordToken(): DiscordToken | null {
  const token = getToken('discord')
  const authToken = token?.token as string | undefined
  const channelIds = (token?.channelIds as string[] | undefined) ?? []
  if (!authToken || channelIds.length === 0) return null
  return { token: authToken, channelIds }
}

function authHeader(token: string): string {
  return token.startsWith('Bot ') ? token : `Bot ${token}`
}

async function discordApi<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    headers: {
      Authorization: authHeader(token)
    }
  })
  if (!res.ok) {
    throw new Error(`Discord API error ${res.status}`)
  }
  return (await res.json()) as T
}

export async function connectDiscordToken(token: string, channelIds: string[]): Promise<void> {
  setToken('discord', { token, channelIds })
  setConnection('discord', true)
}

export async function fetchDiscordMessages(limit = 25): Promise<StreamItem[]> {
  const auth = getDiscordToken()
  if (!auth) return []

  const items: StreamItem[] = []
  for (const channelId of auth.channelIds.slice(0, 20)) {
    const channel = await discordApi<{ id: string; name?: string }>(`/channels/${channelId}`, auth.token)
    const messages = await discordApi<
      {
        id: string
        content: string
        timestamp: string
        author: { id: string; username: string; global_name?: string; avatar?: string | null }
      }[]
    >(`/channels/${channelId}/messages?limit=${Math.max(1, Math.min(100, limit))}`, auth.token)

    for (const message of messages) {
      if (!message.content?.trim()) continue
      items.push(
        normalizeDiscordMessage({
          id: message.id,
          channelId,
          channelName: channel.name,
          author: message.author,
          content: message.content,
          timestamp: message.timestamp
        })
      )
    }
  }

  return items
}

export async function syncDiscord(io?: SocketServer): Promise<StreamItem[]> {
  if (!getDiscordToken()) return []
  try {
    const items = await fetchDiscordMessages(25)
    const newItems = items.filter((i) => !itemExists(i.id))
    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)
    return items
  } catch (err) {
    console.error('[discord] sync failed:', err)
    return []
  }
}

export function isDiscordConfigured(): boolean {
  return true
}

export function isDiscordConnected(): boolean {
  return !!getDiscordToken()
}

export async function resolveDiscordChannel(nameOrId: string): Promise<string> {
  const auth = getDiscordToken()
  if (!auth) throw new Error('Discord not connected')

  if (/^\d+$/.test(nameOrId)) return nameOrId

  const needle = nameOrId.replace(/^#/, '').toLowerCase()
  for (const channelId of auth.channelIds) {
    const channel = await discordApi<{ id: string; name?: string }>(
      `/channels/${channelId}`,
      auth.token
    )
    if (channel.name?.toLowerCase() === needle || channel.name?.toLowerCase().includes(needle)) {
      return channel.id
    }
  }
  throw new Error(`Discord channel not found in connected channels: ${nameOrId}`)
}

export async function sendDiscordMessage(channelId: string, content: string): Promise<{ id: string }> {
  const auth = getDiscordToken()
  if (!auth) throw new Error('Discord not connected')

  const resolved = await resolveDiscordChannel(channelId)
  const res = await fetch(`https://discord.com/api/v10/channels/${resolved}/messages`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(auth.token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: content.trim() })
  })
  if (!res.ok) throw new Error(`Discord post failed (${res.status})`)
  const json = (await res.json()) as { id: string }
  return { id: json.id }
}
