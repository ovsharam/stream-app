import { openDB } from 'idb'
import type { StreamItem } from '@shared/types'
import { streamItemFromJSON, streamItemToJSON } from '@shared/serialize'

const DB_NAME = 'stream-pwa'
const STORE = 'stream_items'
const MAX_ITEMS = 100

async function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp')
      }
    }
  })
}

export async function cacheStreamItems(items: StreamItem[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  const sorted = [...items]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, MAX_ITEMS)
  await tx.store.clear()
  for (const item of sorted) {
    await tx.store.put({
      id: item.id,
      timestamp: item.timestamp.getTime(),
      raw: streamItemToJSON(item)
    })
  }
  await tx.done

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_STREAM_ITEMS',
      items: sorted.map((i) => ({
        ...i,
        timestamp: i.timestamp.toISOString()
      }))
    })
  }
}

export async function loadCachedStreamItems(): Promise<StreamItem[]> {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((row) => streamItemFromJSON(row.raw as string))
}
