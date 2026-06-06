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
    .replace(/&#(\d+);/g, (_, code) => {
      const n = parseInt(code, 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ' '
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const n = parseInt(hex, 16)
      return Number.isFinite(n) ? String.fromCodePoint(n) : ' '
    })
    .replace(/[\u200B-\u200D\uFEFF\u034F\u00AD]/g, '')
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

export function normalizeMondayUpdate(update: {
  id: string | number
  title: string
  body: string
  user?: { name: string }
  boardName?: string
  createdAt: string | Date
  metadata?: Record<string, unknown>
}): StreamItem {
  const bodyFull = update.body
  return {
    id: `monday-${update.id}`,
    source: 'monday',
    sender: {
      name: update.user?.name ?? 'Monday',
      handle: update.boardName ? `#${update.boardName}` : 'monday'
    },
    timestamp: new Date(update.createdAt),
    title: update.title,
    body: truncate(bodyFull),
    bodyFull,
    isUnread: true,
    isStarred: false,
    metadata: { updateId: String(update.id), ...update.metadata }
  }
}

export function normalizeDiscordMessage(msg: {
  id: string
  channelId: string
  channelName?: string
  author: { username: string; global_name?: string; id: string; avatar?: string | null }
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}): StreamItem {
  const bodyFull = msg.content || '[Attachment / embed]'
  return {
    id: `discord-${msg.channelId}-${msg.id}`,
    source: 'discord',
    sender: {
      name: msg.author.global_name ?? msg.author.username,
      handle: msg.author.username,
      avatarUrl: msg.author.avatar
        ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
        : undefined
    },
    timestamp: new Date(msg.timestamp),
    title: msg.channelName ? `#${msg.channelName}` : '#discord',
    body: truncate(bodyFull),
    bodyFull,
    isUnread: true,
    isStarred: false,
    metadata: { channelId: msg.channelId, messageId: msg.id, ...msg.metadata }
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

export function normalizeAiAssist(input: {
  source: StreamSource
  query: string
  answer: string
  senderName: string
  handle?: string
  metadata?: Record<string, unknown>
}): StreamItem {
  return {
    id: `${input.source}-${uuidv4()}`,
    source: input.source,
    sender: { name: input.senderName, handle: input.handle ?? input.source },
    timestamp: new Date(),
    title: input.query,
    body: truncate(input.answer),
    bodyFull: input.answer,
    isUnread: true,
    isStarred: false,
    metadata: { query: input.query, ...input.metadata }
  }
}

export function normalizeClaudeConversation(input: {
  sessionId: string
  projectSlug: string
  projectLabel: string
  title: string
  body: string
  updatedAt: Date
  messageCount: number
}): StreamItem {
  return {
    id: `claude-session-${input.sessionId}`,
    source: 'claude',
    sender: { name: 'Claude', handle: input.projectLabel },
    timestamp: input.updatedAt,
    title: input.title,
    body: truncate(input.body),
    bodyFull: input.body,
    isUnread: true,
    isStarred: false,
    metadata: {
      sessionId: input.sessionId,
      projectSlug: input.projectSlug,
      projectLabel: input.projectLabel,
      messageCount: input.messageCount,
      conversation: 'true'
    }
  }
}

export function normalizeGithubItem(item: {
  id: string
  number: number
  repo: string
  title: string
  body: string
  url: string
  updatedAt: Date
  author: string
}): StreamItem {
  return {
    id: `github-${item.id}`,
    source: 'github',
    sender: { name: item.author, handle: item.repo },
    timestamp: item.updatedAt,
    title: `#${item.number} ${item.title}`,
    body: truncate(item.body || item.title),
    bodyFull: item.body || item.title,
    isUnread: true,
    isStarred: false,
    metadata: {
      itemId: `github-${item.id}`,
      issueNumber: item.number,
      repo: item.repo,
      url: item.url
    }
  }
}

export function normalizeGdocsItem(item: {
  id: string
  title: string
  url: string
  modifiedAt: Date
  owner: string
  accountEmail?: string
}): StreamItem {
  return {
    id: `gdocs-${item.id}`,
    source: 'gdocs',
    sender: { name: item.owner, handle: 'google-docs' },
    timestamp: item.modifiedAt,
    title: item.title,
    body: 'Google Doc updated',
    bodyFull: item.title,
    isUnread: true,
    isStarred: false,
    metadata: {
      itemId: `gdocs-${item.id}`,
      documentId: item.id,
      url: item.url,
      accountEmail: item.accountEmail
    }
  }
}

export function normalizeGongCall(call: {
  id: string
  title: string
  startedAt: Date
  durationSec?: number
  url?: string
  participants: string[]
}): StreamItem {
  const mins = call.durationSec ? Math.round(call.durationSec / 60) : undefined
  return {
    id: `gong-${call.id}`,
    source: 'gong',
    sender: { name: 'Gong', handle: 'gong' },
    timestamp: call.startedAt,
    title: call.title,
    body: truncate(
      `${call.participants.slice(0, 3).join(', ') || 'Call'}${mins ? ` · ${mins} min` : ''}`
    ),
    bodyFull: call.participants.join(', '),
    isUnread: true,
    isStarred: false,
    metadata: {
      itemId: `gong-${call.id}`,
      callId: call.id,
      url: call.url,
      participants: call.participants
    }
  }
}

export function normalizeCalcomBooking(booking: Record<string, unknown>): StreamItem | null {
  const uid = String(booking.uid ?? booking.id ?? '').trim()
  if (!uid) return null

  const eventType =
    booking.eventType && typeof booking.eventType === 'object'
      ? (booking.eventType as { title?: string; slug?: string })
      : undefined
  const title = String(booking.title ?? eventType?.title ?? 'Cal.com booking').trim()

  const startRaw =
    booking.startTime ?? booking.start ?? booking.startTimeUtc ?? booking.createdAt
  const endRaw = booking.endTime ?? booking.end ?? booking.endTimeUtc
  const start = startRaw ? new Date(String(startRaw)) : new Date()
  const end = endRaw ? new Date(String(endRaw)) : undefined

  const attendees = Array.isArray(booking.attendees)
    ? (booking.attendees as { name?: string; email?: string }[])
    : []
  const guest = attendees[0]
  const guestLabel = guest?.name
    ? guest.email
      ? `${guest.name} (${guest.email})`
      : guest.name
    : guest?.email

  const status = String(booking.status ?? 'scheduled')
  const bodyParts = [
    guestLabel,
    start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    end ? `→ ${end.toLocaleTimeString(undefined, { timeStyle: 'short' })}` : undefined,
    `Status: ${status}`
  ].filter(Boolean)

  const body = bodyParts.join(' · ')

  return {
    id: `calcom-${uid}`,
    source: 'calcom',
    sender: { name: 'Cal.com', handle: 'calcom' },
    timestamp: start,
    title,
    body: truncate(body),
    bodyFull: body,
    isUnread: true,
    isStarred: false,
    metadata: {
      itemId: `calcom-${uid}`,
      bookingUid: uid,
      url: `https://app.cal.com/bookings/${uid}`,
      status,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      attendeeEmail: guest?.email,
      attendeeName: guest?.name,
      eventTypeSlug: eventType?.slug
    }
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
    case 'monday':
      return normalizeMondayUpdate(payload as Parameters<typeof normalizeMondayUpdate>[0])
    case 'discord':
      return normalizeDiscordMessage(payload as Parameters<typeof normalizeDiscordMessage>[0])
    case 'perplexity':
      return normalizePerplexityResponse(
        payload as Parameters<typeof normalizePerplexityResponse>[0]
      )
    case 'claude':
    case 'gemini':
    case 'cursor':
      return normalizeAiAssist(payload as Parameters<typeof normalizeAiAssist>[0])
    case 'github':
      return normalizeGithubItem(payload as Parameters<typeof normalizeGithubItem>[0])
    case 'gdocs':
      return normalizeGdocsItem(payload as Parameters<typeof normalizeGdocsItem>[0])
    case 'gong':
      return normalizeGongCall(payload as Parameters<typeof normalizeGongCall>[0])
    case 'calcom':
      return normalizeCalcomBooking(payload)
    case 'meeting':
      return null
    case 'note':
      return normalizeNote(String(payload.text ?? ''), payload.title as string | undefined)
    default:
      return null
  }
}
