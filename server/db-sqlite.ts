import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { join } from 'path'
import type { StreamItem, StreamSource } from '../shared/types'
import { streamItemFromJSON, streamItemToJSON } from '../shared/serialize'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stream_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  sender_name TEXT,
  sender_handle TEXT,
  timestamp INTEGER,
  title TEXT,
  body TEXT,
  body_full TEXT,
  is_unread INTEGER DEFAULT 1,
  is_starred INTEGER DEFAULT 0,
  raw_json TEXT,
  created_at INTEGER DEFAULT (unixepoch('now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_timestamp ON stream_items(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_source ON stream_items(source);
CREATE INDEX IF NOT EXISTS idx_unread ON stream_items(is_unread);
`

let db: Database.Database | null = null

export function initDb(dataDir: string): Database.Database {
  mkdirSync(dataDir, { recursive: true })
  const dbPath = join(dataDir, 'stream.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function upsertItem(item: StreamItem): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO stream_items (id, source, sender_name, sender_handle, timestamp, title, body, body_full, is_unread, is_starred, raw_json)
       VALUES (@id, @source, @sender_name, @sender_handle, @timestamp, @title, @body, @body_full, @is_unread, @is_starred, @raw_json)
       ON CONFLICT(id) DO UPDATE SET sender_name=excluded.sender_name, sender_handle=excluded.sender_handle,
       timestamp=excluded.timestamp, title=excluded.title, body=excluded.body, body_full=excluded.body_full,
       is_unread=excluded.is_unread, is_starred=excluded.is_starred, raw_json=excluded.raw_json`
    )
    .run({
      id: item.id,
      source: item.source,
      sender_name: item.sender.name,
      sender_handle: item.sender.handle ?? null,
      timestamp: item.timestamp.getTime(),
      title: item.title ?? null,
      body: item.body,
      body_full: item.bodyFull ?? null,
      is_unread: item.isUnread ? 1 : 0,
      is_starred: item.isStarred ? 1 : 0,
      raw_json: streamItemToJSON(item)
    })
}

export function upsertItems(items: StreamItem[]): void {
  const database = getDb()
  const tx = database.transaction((batch: StreamItem[]) => {
    for (const item of batch) upsertItem(item)
  })
  tx(items)
}

export function getRecentItems(limit = 100, source?: StreamSource): StreamItem[] {
  const database = getDb()
  const query = source
    ? `SELECT raw_json FROM stream_items WHERE source = ? ORDER BY timestamp DESC LIMIT ?`
    : `SELECT raw_json FROM stream_items ORDER BY timestamp DESC LIMIT ?`
  const rows = source
    ? (database.prepare(query).all(source, limit) as { raw_json: string }[])
    : (database.prepare(query).all(limit) as { raw_json: string }[])

  return rows.map((r) => streamItemFromJSON(r.raw_json))
}

export function updateItemFlags(
  id: string,
  flags: { isUnread?: boolean; isStarred?: boolean }
): StreamItem | null {
  const database = getDb()
  const row = database.prepare('SELECT raw_json FROM stream_items WHERE id = ?').get(id) as
    | { raw_json: string }
    | undefined
  if (!row) return null
  const item = streamItemFromJSON(row.raw_json)
  if (flags.isUnread !== undefined) item.isUnread = flags.isUnread
  if (flags.isStarred !== undefined) item.isStarred = flags.isStarred
  upsertItem(item)
  return item
}

export function itemExists(id: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM stream_items WHERE id = ?').get(id)
}

export function deleteItemsByIds(ids: string[]): number {
  const database = getDb()
  const stmt = database.prepare('DELETE FROM stream_items WHERE id = ?')
  let removed = 0
  const tx = database.transaction((batch: string[]) => {
    for (const id of batch) {
      removed += stmt.run(id).changes
    }
  })
  tx(ids)
  return removed
}

/** Remove demo seed rows left over from early DEMO_MODE runs. */
export function deleteDemoSeedItems(): number {
  const database = getDb()
  const result = database
    .prepare(
      `DELETE FROM stream_items WHERE
        id IN ('gmail-demo-thread-1', 'x-demo-tweet-1')
        OR (source = 'slack' AND body LIKE '%Staging deploy green%')
        OR (source = 'perplexity' AND title = 'What changed in my stream?')
        OR (source = 'note' AND body LIKE '%Follow up with Sarah after standup%')`
    )
    .run()
  return result.changes
}
