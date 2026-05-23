import axios from 'axios'
import type { Server as SocketServer } from 'socket.io'
import { normalizePerplexityResponse } from '../normalizer'
import { upsertItem } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'

const API_URL = 'https://api.perplexity.ai/chat/completions'

export function connectPerplexity(apiKey: string): void {
  setToken('perplexity', { apiKey })
  setConnection('perplexity', true)
}

export function isPerplexityConnected(): boolean {
  return !!getToken('perplexity')?.apiKey
}

export async function queryPerplexity(
  query: string,
  systemPrompt: string
): Promise<StreamItem> {
  const tokens = getToken('perplexity')
  const apiKey = tokens?.apiKey as string | undefined
  if (!apiKey) throw new Error('Perplexity not connected')

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
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
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
