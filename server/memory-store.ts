import type { StreamItem, StreamSource } from '../shared/types'
import { streamItemFromJSON, streamItemToJSON } from '../shared/serialize'

const items = new Map<string, string>()
const sessionTokens = new Map<string, Map<string, string>>()
const sessionMeta = new Map<string, string>()

export const memoryStore = {
  init(): void {
    // persist across warm invocations in same lambda
  },

  upsertItem(item: StreamItem): void {
    items.set(item.id, streamItemToJSON(item))
  },

  upsertItems(batch: StreamItem[]): void {
    for (const item of batch) memoryStore.upsertItem(item)
  },

  getRecentItems(limit = 100, source?: StreamSource): StreamItem[] {
    const all = [...items.values()].map((r) => streamItemFromJSON(r))
    const filtered = source ? all.filter((i) => i.source === source) : all
    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  },

  updateItemFlags(
    id: string,
    flags: { isUnread?: boolean; isStarred?: boolean }
  ): StreamItem | null {
    const raw = items.get(id)
    if (!raw) return null
    const item = streamItemFromJSON(raw)
    if (flags.isUnread !== undefined) item.isUnread = flags.isUnread
    if (flags.isStarred !== undefined) item.isStarred = flags.isStarred
    memoryStore.upsertItem(item)
    return item
  },

  itemExists(id: string): boolean {
    return items.has(id)
  },

  getToken(sessionId: string, source: string): Record<string, unknown> | undefined {
    const tok = sessionTokens.get(sessionId)?.get(source)
    if (!tok) return undefined
    try {
      return JSON.parse(tok) as Record<string, unknown>
    } catch {
      return undefined
    }
  },

  setToken(sessionId: string, source: string, token: Record<string, unknown>): void {
    if (!sessionTokens.has(sessionId)) sessionTokens.set(sessionId, new Map())
    sessionTokens.get(sessionId)!.set(source, JSON.stringify(token))
  },

  getMeta(sessionId: string): string | undefined {
    return sessionMeta.get(sessionId)
  },

  setMeta(sessionId: string, meta: string): void {
    sessionMeta.set(sessionId, meta)
  }
}
