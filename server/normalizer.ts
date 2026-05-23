import { v4 as uuidv4 } from 'uuid'
import type { StreamItem, StreamSource } from '../shared/types'

const PREVIEW_MAX = 280

function truncate(text: string, max = PREVIEW_MAX): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max - 1)}…`
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeGmailThread(thread: {
  id: string
  snippet?: string
  subject?: string
  from?: { name: string; email: string }
  date: Date
  body?: string
  labelIds?: string[]
  metadata?: Record<string, unknown>
}): StreamItem | null {
  const skipLabels = ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'SPAM', 'TRASH']
  if (thread.labelIds?.some((l) => skipLabels.includes(l))) return null

  const bodyFull = thread.body ? stripHtml(thread.body) : stripHtml(thread.snippet ?? '')
  const body = truncate(bodyFull)

  return {
    id: `gmail-${thread.id}`,
    source: 'gmail',
    sender: {
      name: thread.from?.name || thread.from?.email || 'Unknown',
      handle: thread.from?.email
    },
    timestamp: thread.date,
    title: thread.subject,
    body,
    bodyFull,
    isUnread: thread.labelIds?.includes('UNREAD') ?? true,
    isStarred: thread.labelIds?.includes('STARRED') ?? false,
    metadata: { threadId: thread.id, ...thread.metadata }
  }
}

export function normalizeSlackMessage(msg: {
  ts: string
  channel?: string
  channelName?: string
  user?: { name: string; id: string; avatar?: string }
  text: string
  threadTs?: string
  replyCount?: number
  reactions?: { emoji: string; count: number }[]
  metadata?: Record<string, unknown>
}): StreamItem {
  const bodyFull = msg.text
  return {
    id: `slack-${msg.channel}-${msg.ts}`,
    source: 'slack',
    sender: {
      name: msg.user?.name || 'Unknown',
      handle: msg.user?.id,
      avatarUrl: msg.user?.avatar
    },
    timestamp: new Date(parseFloat(msg.ts) * 1000),
    title: msg.channelName ? `#${msg.channelName}` : undefined,
    body: truncate(bodyFull),
    bodyFull,
    thread: msg.threadTs
      ? {
          id: msg.threadTs,
          replyCount: msg.replyCount ?? 0,
          participants: []
        }
      : undefined,
    reactions: msg.reactions,
    isUnread: true,
    isStarred: false,
    metadata: { channel: msg.channel, ts: msg.ts, ...msg.metadata }
  }
}

export function normalizeXTweet(tweet: {
  id: string
  text: string
  author: { name: string; username: string; profile_image_url?: string }
  created_at: string
  public_metrics?: { like_count?: number; retweet_count?: number }
  referenced_tweets?: { type: string }[]
  metadata?: Record<string, unknown>
}): StreamItem | null {
  const isRetweet = tweet.referenced_tweets?.some((r) => r.type === 'retweeted')
  if (isRetweet) return null

  const bodyFull = tweet.text
  return {
    id: `x-${tweet.id}`,
    source: 'x',
    sender: {
      name: tweet.author.name,
      handle: `@${tweet.author.username}`,
      avatarUrl: tweet.author.profile_image_url
    },
    timestamp: new Date(tweet.created_at),
    body: truncate(bodyFull),
    bodyFull,
    isUnread: true,
    isStarred: false,
    metadata: {
      tweetId: tweet.id,
      metrics: tweet.public_metrics,
      ...tweet.metadata
    }
  }
}

export function normalizePerplexityResponse(response: {
  query: string
  answer: string
  citations?: { title: string; url: string }[]
  metadata?: Record<string, unknown>
}): StreamItem {
  const attachments =
    response.citations?.map((c) => ({
      type: 'link' as const,
      name: c.title,
      url: c.url
    })) ?? []

  return {
    id: `perplexity-${uuidv4()}`,
    source: 'perplexity',
    sender: { name: 'Perplexity', handle: 'assistant' },
    timestamp: new Date(),
    title: response.query,
    body: truncate(response.answer),
    bodyFull: response.answer,
    attachments,
    isUnread: true,
    isStarred: false,
    metadata: { query: response.query, ...response.metadata }
  }
}

export function normalizeNote(text: string, title?: string): StreamItem {
  return {
    id: `note-${uuidv4()}`,
    source: 'note',
    sender: { name: 'You', handle: 'local' },
    timestamp: new Date(),
    title,
    body: truncate(text),
    bodyFull: text,
    isUnread: false,
    isStarred: false,
    metadata: {}
  }
}

export function normalizeRaw(
  source: StreamSource,
  payload: Record<string, unknown>
): StreamItem | null {
  switch (source) {
    case 'gmail':
      return normalizeGmailThread(payload as Parameters<typeof normalizeGmailThread>[0])
    case 'slack':
      return normalizeSlackMessage(payload as Parameters<typeof normalizeSlackMessage>[0])
    case 'x':
      return normalizeXTweet(payload as Parameters<typeof normalizeXTweet>[0])
    case 'perplexity':
      return normalizePerplexityResponse(
        payload as Parameters<typeof normalizePerplexityResponse>[0]
      )
    case 'note':
      return normalizeNote(String(payload.text ?? ''), payload.title as string | undefined)
    default:
      return null
  }
}
