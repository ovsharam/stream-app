import type { StreamItem, StreamSource } from '../shared/types'
import { memoryStore } from './memory-store'

const useMemory = () => !!process.env.VERCEL

let sqliteModule: typeof import('./db-sqlite') | null = null

async function sqlite() {
  if (!sqliteModule) sqliteModule = await import('./db-sqlite')
  return sqliteModule
}

export async function initDb(dataDir: string): Promise<void> {
  if (useMemory()) {
    memoryStore.init()
    return
  }
  const mod = await sqlite()
  mod.initDb(dataDir)
}

export function upsertItem(item: StreamItem): void {
  if (useMemory()) return memoryStore.upsertItem(item)
  // sync init path — local dev initializes before calls
  const mod = require('./db-sqlite') as typeof import('./db-sqlite')
  mod.upsertItem(item)
}

export function upsertItems(items: StreamItem[]): void {
  if (useMemory()) return memoryStore.upsertItems(items)
  const mod = require('./db-sqlite') as typeof import('./db-sqlite')
  mod.upsertItems(items)
}

export function getRecentItems(limit = 100, source?: StreamSource): StreamItem[] {
  if (useMemory()) return memoryStore.getRecentItems(limit, source)
  const mod = require('./db-sqlite') as typeof import('./db-sqlite')
  return mod.getRecentItems(limit, source)
}

export function updateItemFlags(
  id: string,
  flags: { isUnread?: boolean; isStarred?: boolean }
): StreamItem | null {
  if (useMemory()) return memoryStore.updateItemFlags(id, flags)
  const mod = require('./db-sqlite') as typeof import('./db-sqlite')
  return mod.updateItemFlags(id, flags)
}

export function itemExists(id: string): boolean {
  if (useMemory()) return memoryStore.itemExists(id)
  const mod = require('./db-sqlite') as typeof import('./db-sqlite')
  return mod.itemExists(id)
}
