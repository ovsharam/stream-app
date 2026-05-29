import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  ActionTrace,
  Datapoint,
  KbEdge,
  KbEntity
} from '../../shared/personal-kb'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kb_entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized TEXT NOT NULL,
  mention_count INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_entities_norm ON kb_entities(normalized);

CREATE TABLE IF NOT EXISTS kb_edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_datapoints (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  title TEXT,
  body TEXT NOT NULL,
  ingested_at INTEGER NOT NULL,
  intention_json TEXT NOT NULL,
  entity_ids_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_datapoints_time ON kb_datapoints(ingested_at DESC);

CREATE TABLE IF NOT EXISTS kb_traces (
  id TEXT PRIMARY KEY,
  datapoint_id TEXT,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  provider TEXT,
  action_kind TEXT NOT NULL,
  raw_command TEXT,
  seen_at INTEGER,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  time_to_action_ms INTEGER NOT NULL,
  concurrent_json TEXT NOT NULL,
  outcome TEXT NOT NULL,
  intention_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kb_traces_time ON kb_traces(started_at DESC);

CREATE TABLE IF NOT EXISTS kb_seen (
  item_id TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);
`

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  const dataDir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  const path = join(dataDir, 'kb.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function upsertEntity(input: {
  kind: KbEntity['kind']
  label: string
}): KbEntity {
  const d = getDb()
  const normalized = input.label.toLowerCase().replace(/\s+/g, ' ').trim()
  const existing = d.prepare('SELECT * FROM kb_entities WHERE normalized = ?').get(normalized) as
    | Record<string, unknown>
    | undefined

  const now = Date.now()
  if (existing) {
    d.prepare('UPDATE kb_entities SET mention_count = mention_count + 1, updated_at = ? WHERE id = ?').run(
      now,
      existing.id
    )
    return rowEntity(existing)
  }

  const id = `ent-${randomUUID()}`
  d.prepare(
    `INSERT INTO kb_entities (id, kind, label, normalized, mention_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(id, input.kind, input.label.trim(), normalized, now, now)

  return {
    id,
    kind: input.kind,
    label: input.label.trim(),
    normalized,
    mentionCount: 1,
    createdAt: now,
    updatedAt: now
  }
}

export function linkEntities(
  fromId: string,
  toId: string,
  relation: KbEdge['relation'],
  weight = 1
): void {
  const d = getDb()
  const id = `edge-${fromId}-${relation}-${toId}`
  d.prepare(
    `INSERT OR REPLACE INTO kb_edges (id, from_id, to_id, relation, weight, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, fromId, toId, relation, weight, Date.now())
}

export function insertDatapoint(dp: Datapoint): void {
  const d = getDb()
  d.prepare(
    `INSERT OR REPLACE INTO kb_datapoints
     (id, kind, source, source_ref, title, body, ingested_at, intention_json, entity_ids_json, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dp.id,
    dp.kind,
    dp.source,
    dp.sourceRef ?? null,
    dp.title ?? null,
    dp.body,
    dp.ingestedAt,
    JSON.stringify(dp.intention),
    JSON.stringify(dp.entityIds),
    JSON.stringify(dp.metadata)
  )
}

export function insertTrace(trace: ActionTrace): void {
  const d = getDb()
  d.prepare(
    `INSERT INTO kb_traces
     (id, datapoint_id, subject_type, subject_id, operator_id, provider, action_kind, raw_command,
      seen_at, started_at, completed_at, time_to_action_ms, concurrent_json, outcome, intention_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    trace.id,
    trace.datapointId ?? null,
    trace.subjectType,
    trace.subjectId,
    trace.operatorId,
    trace.provider ?? null,
    trace.actionKind,
    trace.rawCommand ?? null,
    trace.seenAt,
    trace.startedAt,
    trace.completedAt,
    trace.timeToActionMs,
    JSON.stringify(trace.concurrentTraceIds),
    trace.outcome,
    JSON.stringify(trace.intention)
  )
}

export function listDatapoints(limit = 200): Datapoint[] {
  const d = getDb()
  const rows = d
    .prepare('SELECT * FROM kb_datapoints WHERE kind != ? ORDER BY ingested_at DESC LIMIT ?')
    .all('telemetry', limit) as Record<string, unknown>[]
  return rows.map(rowDatapoint)
}

export function listEntities(limit = 100): KbEntity[] {
  const d = getDb()
  return (
    d.prepare('SELECT * FROM kb_entities ORDER BY mention_count DESC LIMIT ?').all(limit) as Record<
      string,
      unknown
    >[]
  ).map(rowEntity)
}

export function listTraces(limit = 80): ActionTrace[] {
  const d = getDb()
  return (
    d.prepare('SELECT * FROM kb_traces ORDER BY started_at DESC LIMIT ?').all(limit) as Record<
      string,
      unknown
    >[]
  ).map(rowTrace)
}

export function getDatapoint(id: string): Datapoint | undefined {
  const d = getDb()
  const row = d.prepare('SELECT * FROM kb_datapoints WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowDatapoint(row) : undefined
}

export function markItemSeen(itemId: string, seenAt: number): void {
  getDb().prepare('INSERT OR REPLACE INTO kb_seen (item_id, seen_at) VALUES (?, ?)').run(itemId, seenAt)
}

export function getItemSeenAt(itemId: string): number | undefined {
  const row = getDb().prepare('SELECT seen_at FROM kb_seen WHERE item_id = ?').get(itemId) as
    | { seen_at: number }
    | undefined
  return row?.seen_at
}

function rowEntity(r: Record<string, unknown>): KbEntity {
  return {
    id: String(r.id),
    kind: r.kind as KbEntity['kind'],
    label: String(r.label),
    normalized: String(r.normalized),
    mentionCount: Number(r.mention_count ?? 1),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }
}

function rowDatapoint(r: Record<string, unknown>): Datapoint {
  return {
    id: String(r.id),
    kind: r.kind as Datapoint['kind'],
    source: String(r.source),
    sourceRef: r.source_ref ? String(r.source_ref) : undefined,
    title: r.title ? String(r.title) : undefined,
    body: String(r.body),
    ingestedAt: Number(r.ingested_at),
    intention: JSON.parse(String(r.intention_json)),
    entityIds: JSON.parse(String(r.entity_ids_json)),
    metadata: JSON.parse(String(r.metadata_json))
  }
}

function rowTrace(r: Record<string, unknown>): ActionTrace {
  return {
    id: String(r.id),
    datapointId: r.datapoint_id ? String(r.datapoint_id) : undefined,
    subjectType: r.subject_type as ActionTrace['subjectType'],
    subjectId: String(r.subject_id),
    operatorId: String(r.operator_id),
    provider: r.provider ? String(r.provider) : undefined,
    actionKind: String(r.action_kind),
    rawCommand: r.raw_command ? String(r.raw_command) : undefined,
    seenAt: Number(r.seen_at ?? r.started_at),
    startedAt: Number(r.started_at),
    completedAt: Number(r.completed_at),
    timeToActionMs: Number(r.time_to_action_ms),
    concurrentTraceIds: JSON.parse(String(r.concurrent_json)),
    outcome: r.outcome as ActionTrace['outcome'],
    intention: JSON.parse(String(r.intention_json))
  }
}
