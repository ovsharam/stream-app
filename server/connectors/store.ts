import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { ConnectorConfig, ConnectorCredentials, ConnectorSettings, ConnectorType, SyncRun } from './types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pg_connectors (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  credentials_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending_auth',
  error_msg TEXT,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connectors_customer ON pg_connectors(customer_id, type);

CREATE TABLE IF NOT EXISTS pg_connector_sync_runs (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  chunks_processed INTEGER NOT NULL DEFAULT 0,
  nodes_extracted INTEGER NOT NULL DEFAULT 0,
  error_msg TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_connector ON pg_connector_sync_runs(connector_id, started_at DESC);
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

// ─── Connectors ──────────────────────────────────────────────────────────────

export function createConnector(params: {
  customerId: string
  type: ConnectorType
  label: string
  credentials: ConnectorCredentials
  settings: ConnectorSettings
}): ConnectorConfig {
  const now = Date.now()
  const connector: ConnectorConfig = {
    id: randomUUID(),
    customerId: params.customerId,
    type: params.type,
    label: params.label,
    credentials: params.credentials,
    settings: params.settings,
    status: 'pending_auth',
    createdAt: now,
    updatedAt: now,
  }
  getDb()
    .prepare(
      `INSERT INTO pg_connectors (id, customer_id, type, label, credentials_json, settings_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_auth', ?, ?)`
    )
    .run(
      connector.id,
      connector.customerId,
      connector.type,
      connector.label,
      JSON.stringify(connector.credentials),
      JSON.stringify(connector.settings),
      now,
      now
    )
  return connector
}

export function getConnector(id: string): ConnectorConfig | null {
  const row = getDb()
    .prepare(`SELECT * FROM pg_connectors WHERE id=?`)
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToConnector(row) : null
}

export function listConnectors(customerId: string): ConnectorConfig[] {
  return (
    getDb()
      .prepare(`SELECT * FROM pg_connectors WHERE customer_id=? ORDER BY created_at DESC`)
      .all(customerId) as Record<string, unknown>[]
  ).map(rowToConnector)
}

export function listActiveConnectors(): ConnectorConfig[] {
  return (
    getDb()
      .prepare(`SELECT * FROM pg_connectors WHERE status='active'`)
      .all() as Record<string, unknown>[]
  ).map(rowToConnector)
}

export function updateConnectorStatus(
  id: string,
  status: ConnectorConfig['status'],
  extra?: { errorMsg?: string; lastSyncAt?: number; credentials?: ConnectorCredentials }
): void {
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE pg_connectors
       SET status=?, error_msg=COALESCE(?,error_msg), last_sync_at=COALESCE(?,last_sync_at),
           credentials_json=COALESCE(?,credentials_json), updated_at=?
       WHERE id=?`
    )
    .run(
      status,
      extra?.errorMsg ?? null,
      extra?.lastSyncAt ?? null,
      extra?.credentials ? JSON.stringify(extra.credentials) : null,
      now,
      id
    )
}

export function updateConnectorCredentials(id: string, credentials: ConnectorCredentials): void {
  getDb()
    .prepare(`UPDATE pg_connectors SET credentials_json=?, status='active', updated_at=? WHERE id=?`)
    .run(JSON.stringify(credentials), Date.now(), id)
}

export function deleteConnector(id: string): void {
  getDb().prepare(`DELETE FROM pg_connectors WHERE id=?`).run(id)
  getDb().prepare(`DELETE FROM pg_connector_sync_runs WHERE connector_id=?`).run(id)
}

function rowToConnector(r: Record<string, unknown>): ConnectorConfig {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    type: String(r.type) as ConnectorType,
    label: String(r.label),
    credentials: JSON.parse(String(r.credentials_json ?? '{}')),
    settings: JSON.parse(String(r.settings_json ?? '{}')),
    status: String(r.status) as ConnectorConfig['status'],
    errorMsg: r.error_msg ? String(r.error_msg) : undefined,
    lastSyncAt: r.last_sync_at ? Number(r.last_sync_at) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

// ─── Sync runs ────────────────────────────────────────────────────────────────

export function createSyncRun(connectorId: string, customerId: string): SyncRun {
  const run: SyncRun = {
    id: randomUUID(),
    connectorId,
    customerId,
    status: 'running',
    chunksProcessed: 0,
    nodesExtracted: 0,
    startedAt: Date.now(),
  }
  getDb()
    .prepare(
      `INSERT INTO pg_connector_sync_runs (id, connector_id, customer_id, status, chunks_processed, nodes_extracted, started_at)
       VALUES (?, ?, ?, 'running', 0, 0, ?)`
    )
    .run(run.id, run.connectorId, run.customerId, run.startedAt)
  return run
}

export function completeSyncRun(
  id: string,
  result: { chunksProcessed: number; nodesExtracted: number; error?: string }
): void {
  getDb()
    .prepare(
      `UPDATE pg_connector_sync_runs
       SET status=?, chunks_processed=?, nodes_extracted=?, error_msg=?, completed_at=?
       WHERE id=?`
    )
    .run(
      result.error ? 'error' : 'done',
      result.chunksProcessed,
      result.nodesExtracted,
      result.error ?? null,
      Date.now(),
      id
    )
}

export function listSyncRuns(connectorId: string, limit = 20): SyncRun[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM pg_connector_sync_runs WHERE connector_id=? ORDER BY started_at DESC LIMIT ?`
      )
      .all(connectorId, limit) as Record<string, unknown>[]
  ).map(r => ({
    id: String(r.id),
    connectorId: String(r.connector_id),
    customerId: String(r.customer_id),
    status: String(r.status) as SyncRun['status'],
    chunksProcessed: Number(r.chunks_processed),
    nodesExtracted: Number(r.nodes_extracted),
    errorMsg: r.error_msg ? String(r.error_msg) : undefined,
    startedAt: Number(r.started_at),
    completedAt: r.completed_at ? Number(r.completed_at) : undefined,
  }))
}
