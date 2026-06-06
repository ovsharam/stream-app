import type { StreamSource } from '@shared/types'

export type FeedStream = {
  id: string
  label: string
  sources: StreamSource[]
}

const STREAMS_KEY = 'stream.central.feedStreams'
const ACTIVE_KEY = 'stream.central.activeFeedStream'

export const FEED_SOURCE_OPTIONS: { id: StreamSource; label: string }[] = [
  { id: 'gmail', label: 'Gmail' },
  { id: 'slack', label: 'Slack' },
  { id: 'discord', label: 'Discord' },
  { id: 'monday', label: 'Monday' },
  { id: 'x', label: 'X' },
  { id: 'github', label: 'GitHub' },
  { id: 'gdocs', label: 'Docs' },
  { id: 'gong', label: 'Gong' },
  { id: 'calcom', label: 'Cal.com' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'note', label: 'Notes' },
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'perplexity', label: 'Perplexity' }
]

export const FEED_SOURCE_GROUPS: { id: string; label: string; sources: StreamSource[] }[] = [
  { id: 'comms', label: 'Comms', sources: ['gmail', 'slack', 'discord'] },
  { id: 'work', label: 'Work', sources: ['monday', 'meeting', 'gdocs', 'gong', 'calcom'] },
  { id: 'notes', label: 'Notes', sources: ['note'] },
  {
    id: 'build',
    label: 'Build',
    sources: ['cursor', 'github', 'claude', 'gemini', 'perplexity', 'x']
  }
]

const SOURCE_LABEL = new Map(FEED_SOURCE_OPTIONS.map((o) => [o.id, o.label]))

export function sourceLabel(id: StreamSource): string {
  return SOURCE_LABEL.get(id) ?? id
}

export const BUILTIN_STREAMS: FeedStream[] = [
  { id: 'all', label: 'All sources', sources: [] },
  { id: 'comms', label: 'Comms', sources: ['gmail', 'slack', 'discord'] },
  { id: 'work', label: 'Work', sources: ['monday', 'meeting', 'gdocs', 'gong', 'calcom'] },
  { id: 'build', label: 'Build', sources: ['cursor', 'github', 'claude', 'gemini'] }
]

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadCustomStreams(): FeedStream[] {
  return readJson<FeedStream[]>(STREAMS_KEY, [])
}

export function saveCustomStreams(streams: FeedStream[]): void {
  localStorage.setItem(STREAMS_KEY, JSON.stringify(streams))
}

export function loadActiveStreamId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? 'all'
}

export function saveActiveStreamId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

export function allStreams(): FeedStream[] {
  return [...BUILTIN_STREAMS, ...loadCustomStreams()]
}

export function streamById(id: string): FeedStream | undefined {
  return allStreams().find((s) => s.id === id)
}

export function sourcesForStream(id: string): Set<StreamSource> | null {
  const stream = streamById(id)
  if (!stream || stream.id === 'all' || stream.sources.length === 0) return null
  return new Set(stream.sources)
}

export function filterEventsByStream<T extends { source: StreamSource }>(
  events: T[],
  streamId: string
): T[] {
  const sources = sourcesForStream(streamId)
  if (!sources) return events
  return events.filter((e) => sources.has(e.source))
}

export function newStreamId(): string {
  return `stream-${Date.now().toString(36)}`
}
