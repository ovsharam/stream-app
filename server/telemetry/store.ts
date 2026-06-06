import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { OperatorEvent } from '../../shared/operator-events'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operator_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  surface TEXT,
  subject_type TEXT,
  subject_id TEXT,
  correlation_id TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_events_ts ON operator_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_operator_events_type ON operator_events(type);
CREATE INDEX IF NOT EXISTS idx_operator_events_subject ON operator_events(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_operator_events_correlation ON operator_events(correlation_id);
`

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  const dataDir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  const path = join(dataDir, 'operator-events.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function initOperatorTelemetryStore(): void {
  getDb()
}

type StoredRow = {
  id: string
  session_id: string
  operator_id: string
  type: string
  ts: number
  surface: string | null
  subject_type: string | null
  subject_id: string | null
  correlation_id: string | null
  payload_json: string
  created_at: number
}

function rowToEvent(row: StoredRow): OperatorEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    operatorId: row.operator_id,
    type: row.type as OperatorEvent['type'],
    ts: row.ts,
    surface: row.surface ?? undefined,
    subjectType: row.subject_type ?? undefined,
    subjectId: row.subject_id ?? undefined,
    correlationId: row.correlation_id ?? undefined,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>
  }
}

export function insertOperatorEvents(events: OperatorEvent[]): number {
  if (events.length === 0) return 0
  const d = getDb()
  const stmt = d.prepare(`
    INSERT OR IGNORE INTO operator_events
      (id, session_id, operator_id, type, ts, surface, subject_type, subject_id, correlation_id, payload_json, created_at)
    VALUES
      (@id, @session_id, @operator_id, @type, @ts, @surface, @subject_type, @subject_id, @correlation_id, @payload_json, @created_at)
  `)
  const insertMany = d.transaction((rows: OperatorEvent[]) => {
    const now = Date.now()
    let inserted = 0
    for (const event of rows) {
      const info = stmt.run({
        id: event.id,
        session_id: event.sessionId,
        operator_id: event.operatorId,
        type: event.type,
        ts: event.ts,
        surface: event.surface ?? null,
        subject_type: event.subjectType ?? null,
        subject_id: event.subjectId ?? null,
        correlation_id: event.correlationId ?? null,
        payload_json: JSON.stringify(event.payload ?? {}),
        created_at: now
      })
      inserted += info.changes
    }
    return inserted
  })
  return insertMany(events)
}

export function listOperatorEvents(input: {
  since?: number
  type?: string
  limit?: number
} = {}): OperatorEvent[] {
  const d = getDb()
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000)
  const clauses: string[] = []
  const params: Record<string, unknown> = { limit }

  if (input.since != null) {
    clauses.push('ts >= @since')
    params.since = input.since
  }
  if (input.type) {
    clauses.push('type = @type')
    params.type = input.type
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = d
    .prepare(`SELECT * FROM operator_events ${where} ORDER BY ts DESC LIMIT @limit`)
    .all(params) as StoredRow[]
  return rows.map(rowToEvent)
}

export function exportOperatorEventsForTraining(): OperatorEvent[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM operator_events ORDER BY ts ASC')
    .all() as StoredRow[]
  return rows.map(rowToEvent)
}
