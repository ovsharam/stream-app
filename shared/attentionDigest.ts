import { sanitizeDisplayText } from './displayText'
import type { StreamItem } from './types'

export type AttentionBucket = 'tasks' | 'reminders' | 'reviews'

export const ATTENTION_QUERY =
  /attention|priorit(?:y|ies)|today|open loops|what needs|what should i focus|my plate/i

const BUCKET_LABELS: Record<AttentionBucket, string> = {
  tasks: 'Tasks',
  reminders: 'Reminders',
  reviews: 'Reviews & FYI'
}

const BUCKET_ORDER: AttentionBucket[] = ['tasks', 'reminders', 'reviews']

const SKIP_SOURCES = new Set(['gemini', 'claude', 'mobile', 'perplexity', 'cursor'])

function itemText(item: StreamItem): string {
  return `${item.title ?? ''} ${item.bodyFull ?? item.body ?? ''}`.toLowerCase()
}

/** Classify a feed item for the daily attention digest. */
export function classifyAttentionItem(item: StreamItem): AttentionBucket {
  const hay = itemText(item)
  const source = item.source

  if (source === 'monday') return 'tasks'
  if (source === 'github' && /\b(review requested|assigned|action required|merge pull)\b/.test(hay)) {
    return 'tasks'
  }
  if (source === 'slack' && /\b(todo|action item|follow up|can you|please review|due)\b/.test(hay)) {
    return 'tasks'
  }
  if (/\b(action required|overdue|due today|due tomorrow|sign off|approve|complete by|assigned to you)\b/.test(hay)) {
    return 'tasks'
  }

  if (source === 'calcom' || source === 'meeting') return 'reminders'
  if (/\b(you are invited|you're invited|invited to|accept invite|view event|rsvp|just scheduled)\b/.test(hay)) {
    return 'reminders'
  }
  if (/\b(meetup|webinar|panel|dinner|calendar invite|starts at|starts in)\b/.test(hay)) {
    return 'reminders'
  }
  if (/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+[a-z]+\s+\d{1,2}\b/.test(hay) && /\b(\d{1,2}:\d{2}\s*[ap]m|pdt|pst|edt|utc)\b/.test(hay)) {
    return 'reminders'
  }

  if (/\b(job alert|newsletter|view in browser|unsubscribe|marketing|promo|no-reply|noreply)\b/.test(hay)) {
    return 'reviews'
  }
  if (/\b(weekly digest|product update|what's new|grwm)\b/.test(hay)) return 'reviews'

  if (source === 'gmail') {
    if (/\b(re:|fwd:|fw:)\b/.test(hay) && /\b(follow up|please|can you|waiting)\b/.test(hay)) {
      return 'tasks'
    }
    if (/\b(invite|scheduled|event|meetup)\b/.test(hay)) return 'reminders'
    return 'reviews'
  }

  return 'reviews'
}

function extractWhenHint(raw: string): string | null {
  const compact = raw.replace(/\s+/g, ' ')
  const range = compact.match(
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+[A-Za-z]+\s+\d{1,2}(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*-\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?(?:\s*(?:PDT|PST|EDT|EST|UTC))?)?)/i
  )
  if (range?.[1]) return sanitizeDisplayText(range[1], 48)

  const short = compact.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)\s*(?:PDT|PST|EDT|EST)?)/i)
  if (short?.[1]) return sanitizeDisplayText(short[1], 32)
  return null
}

function formatAttentionLine(item: StreamItem): string {
  const title = sanitizeDisplayText(String(item.title ?? item.sender?.name ?? item.source), 110)
  const raw = String(item.bodyFull ?? item.body ?? '')
  const when = extractWhenHint(raw)

  const titleNorm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  const rawNorm = sanitizeDisplayText(raw, 200).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  if (rawNorm.startsWith(titleNorm.slice(0, Math.min(24, titleNorm.length)))) {
    return when ? `${title} · ${when}` : title
  }

  const snippet = sanitizeDisplayText(raw, 90)
  if (!snippet || snippet === title) return when ? `${title} · ${when}` : title
  return when ? `${title} · ${when}` : `${title} — ${snippet}`
}

function itemTime(item: StreamItem): number {
  const ts = item.timestamp instanceof Date ? item.timestamp.getTime() : Number(item.timestamp)
  return Number.isFinite(ts) ? ts : 0
}

function sortBucketItems(a: StreamItem, b: StreamItem, bucket: AttentionBucket): number {
  if (bucket === 'tasks') {
    if (a.isUnread !== b.isUnread) return a.isUnread ? -1 : 1
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1
  }
  return itemTime(b) - itemTime(a)
}

export function isAttentionQuery(q: string): boolean {
  return ATTENTION_QUERY.test(q.trim())
}

/** Build a grouped markdown digest from recent feed items. */
export function buildAttentionDigest(
  items: StreamItem[],
  options?: { intro?: string; maxPerBucket?: number }
): string | null {
  const maxPer = options?.maxPerBucket ?? 5
  const filtered = items.filter((i) => !SKIP_SOURCES.has(i.source))
  if (!filtered.length) return null

  const buckets: Record<AttentionBucket, StreamItem[]> = {
    tasks: [],
    reminders: [],
    reviews: []
  }

  for (const item of filtered) {
    buckets[classifyAttentionItem(item)].push(item)
  }

  for (const key of BUCKET_ORDER) {
    buckets[key].sort((a, b) => sortBucketItems(a, b, key))
  }

  const sections: string[] = []
  for (const key of BUCKET_ORDER) {
    const group = buckets[key].slice(0, maxPer)
    if (!group.length) continue
    sections.push(
      `**${BUCKET_LABELS[key]}**`,
      ...group.map((item) => `• ${formatAttentionLine(item)}`)
    )
  }

  if (!sections.length) return null

  const intro = options?.intro ?? "Here's what might need your attention:"
  return `${intro}\n\n${sections.join('\n')}`
}
