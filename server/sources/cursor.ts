import type { Server as SocketServer } from 'socket.io'
import { normalizeAiAssist } from '../normalizer'
import { upsertItem } from '../db'
import type { StreamItem } from '../../shared/types'
import { apiKey, connectWithToken, getIntegrationToken, isTokenConnected } from './integrationTokens'

const AGENTS_URL = 'https://api.cursor.com/v0/agents'

export function connectCursor(apiKeyValue: string, repo?: string): void {
  connectWithToken('cursor', { apiKey: apiKeyValue, repo: repo?.trim() || undefined })
}

export function isCursorConnected(): boolean {
  return isTokenConnected('cursor')
}

async function launchCursorAgent(prompt: string): Promise<{ id?: string; status?: string } | null> {
  const key = apiKey('cursor')
  if (!key) return null
  const repo = String(getIntegrationToken('cursor')?.repo ?? process.env.CURSOR_DEFAULT_REPO ?? '')
  if (!repo) return null

  try {
    const res = await fetch(AGENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        source: { repository: repo }
      })
    })
    if (!res.ok) return null
    return (await res.json()) as { id?: string; status?: string }
  } catch {
    return null
  }
}

export async function askCursor(
  query: string,
  systemPrompt: string,
  io?: SocketServer
): Promise<StreamItem> {
  if (!isCursorConnected()) throw new Error('Cursor not connected')

  const agent = await launchCursorAgent(`${systemPrompt}\n\n${query}`)
  const answer = agent?.id
    ? `Cursor agent started (${agent.id}). Track progress in Cursor Cloud.`
    : `Cursor prompt queued locally. Add CURSOR repo in Integrations to launch cloud agents.\n\nPrompt: ${query}`

  const item = normalizeAiAssist({
    source: 'cursor',
    query,
    answer,
    senderName: 'Cursor',
    handle: 'cursor',
    metadata: {
      agentId: agent?.id,
      agentStatus: agent?.status ?? 'queued',
      repo: getIntegrationToken('cursor')?.repo
    }
  })
  upsertItem(item)
  io?.emit('stream:item', item)
  return item
}

export async function syncCursor(_io?: SocketServer): Promise<StreamItem[]> {
  return []
}
