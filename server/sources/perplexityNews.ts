import type { Server as SocketServer } from 'socket.io'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import type { PerplexityNewsItem } from '../../shared/cluster'
import { normalizePerplexityResponse } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import type { StreamItem } from '../../shared/types'
import { getToken } from '../store'
import { isPerplexityConnected } from './perplexity'

const API_URL = 'https://api.perplexity.ai/chat/completions'
const NEWS_TTL_MS = 30 * 60_000

let cachedNews: PerplexityNewsItem[] = []
let lastFetchAt = 0
let lastError: string | undefined

function apiKey(): string | undefined {
  const t = getToken('perplexity')
  return String(t?.apiKey ?? '').trim() || undefined
}

function parseNewsJson(text: string): PerplexityNewsItem[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const raw = JSON.parse(match[0]) as { title?: string; summary?: string; url?: string }[]
    return raw
      .filter((n) => n.title?.trim())
      .slice(0, 8)
      .map((n) => ({
        id: `pplx-news-${uuidv4()}`,
        title: n.title!.trim(),
        summary: (n.summary ?? n.title!).trim().slice(0, 220),
        url: n.url?.trim(),
        ts: Date.now()
      }))
  } catch {
    return []
  }
}

function parseNewsFallback(text: string, citations: string[]): PerplexityNewsItem[] {
  const lines = text.split('\n').filter((l) => /^\d+\.|^[-*•]/.test(l.trim()))
  return lines.slice(0, 8).map((line, i) => {
    const cleaned = line.replace(/^\d+\.\s*|^[-*•]\s*/, '').trim()
    const title = cleaned.split(/\s*[—–\-:]\s*/)[0]?.trim() || cleaned.slice(0, 80)
    return {
      id: `pplx-news-${uuidv4()}`,
      title,
      summary: cleaned.slice(0, 220),
      url: citations[i],
      ts: Date.now()
    }
  })
}

export function getPerplexityNewsRail(): {
  news: PerplexityNewsItem[]
  error?: string
  updatedAt?: number
} {
  return {
    news: cachedNews,
    error: lastError,
    updatedAt: lastFetchAt || undefined
  }
}

export async function syncPerplexityNews(
  io?: SocketServer,
  force = false
): Promise<StreamItem[]> {
  if (!isPerplexityConnected()) return []

  const key = apiKey()
  if (!key) return []

  if (!force && cachedNews.length > 0 && Date.now() - lastFetchAt < NEWS_TTL_MS) {
    return []
  }

  try {
    const res = await axios.post(
      API_URL,
      {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are a news editor. Return ONLY valid JSON — no markdown fences.'
          },
          {
            role: 'user',
            content:
              'List 6 top business, tech, and markets news headlines from the last 24 hours. Return JSON array: [{"title":"headline","summary":"one sentence","url":"source url"}]'
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        timeout: 45_000
      }
    )

    const content = String(res.data.choices?.[0]?.message?.content ?? '')
    const citations: string[] = Array.isArray(res.data.citations)
      ? (res.data.citations as string[])
      : []

    let news = parseNewsJson(content)
    if (news.length === 0) {
      news = parseNewsFallback(content, citations)
    }

    cachedNews = news
    lastFetchAt = Date.now()
    lastError = undefined

    const feedItems: StreamItem[] = news.map((n) => {
      const stableId = `perplexity-news-${Buffer.from(n.title).toString('base64url').slice(0, 24)}`
      const item = normalizePerplexityResponse({
        query: n.title,
        answer: n.summary,
        citations: n.url ? [{ title: n.title, url: n.url }] : [],
        metadata: { news: 'true', newsId: n.id, rail: 'calendar' }
      })
      item.id = stableId
      item.timestamp = new Date(n.ts)
      return item
    })

    if (feedItems.length > 0) {
      const fresh = feedItems.filter((i) => !itemExists(i.id))
      upsertItems(feedItems)
      for (const item of fresh) io?.emit('stream:item', item)
    }

    return feedItems
  } catch (err) {
    lastError = String(err)
    return []
  }
}
