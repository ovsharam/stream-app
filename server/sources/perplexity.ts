import axios from 'axios'
import type { Server as SocketServer } from 'socket.io'
import { normalizePerplexityResponse } from '../normalizer'
import { upsertItem } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'
import { syncPerplexityNews } from './perplexityNews'

const API_URL = 'https://api.perplexity.ai/chat/completions'
export const PERPLEXITY_PORTAL_URL = 'https://www.perplexity.ai/settings/api'
export const PERPLEXITY_SIGNIN_URL = 'https://www.perplexity.ai/auth/signin'

export function connectPerplexity(apiKey: string, accountEmail?: string): void {
  setToken('perplexity', {
    apiKey: apiKey.trim(),
    accountEmail: accountEmail?.trim() || undefined,
    authType: 'account',
    connectedAt: Date.now()
  })
  setConnection('perplexity', true)
}

export function isPerplexityConnected(): boolean {
  return !!getToken('perplexity')?.apiKey
}

export function perplexityAccountLabel(): string | undefined {
  const t = getToken('perplexity')
  const email = String(t?.accountEmail ?? '').trim()
  if (email) return email
  if (t?.apiKey) return 'Perplexity account'
  return undefined
}

export async function validatePerplexityKey(apiKey: string): Promise<void> {
  await axios.post(
    API_URL,
    {
      model: 'sonar',
      messages: [{ role: 'user', content: 'Reply with OK only.' }],
      max_tokens: 8
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 30_000
    }
  )
}

export async function connectPerplexityAccount(
  apiKey: string,
  accountEmail?: string,
  io?: SocketServer
): Promise<{ newsCount: number }> {
  await validatePerplexityKey(apiKey)
  connectPerplexity(apiKey, accountEmail)
  const items = await syncPerplexityNews(io, true)
  return { newsCount: items.length }
}

export async function queryPerplexity(
  query: string,
  systemPrompt: string
): Promise<StreamItem> {
  const tokens = getToken('perplexity')
  const key = tokens?.apiKey as string | undefined
  if (!key) throw new Error('Perplexity not connected')

  const res = await axios.post(
    API_URL,
    {
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 60_000
    }
  )

  const content = res.data.choices?.[0]?.message?.content ?? ''
  const citations: { title: string; url: string }[] = []

  if (Array.isArray(res.data.citations)) {
    for (const url of res.data.citations as string[]) {
      citations.push({ title: url, url })
    }
  }

  return normalizePerplexityResponse({
    query,
    answer: content,
    citations
  })
}

export async function askPerplexity(
  query: string,
  systemPrompt: string,
  io?: SocketServer
): Promise<StreamItem> {
  const item = await queryPerplexity(query, systemPrompt)
  upsertItem(item)
  io?.emit('stream:item', item)
  return item
}

export async function syncPerplexity(io?: SocketServer, force = false): Promise<StreamItem[]> {
  return syncPerplexityNews(io, force)
}
