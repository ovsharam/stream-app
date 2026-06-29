/**
 * Connector storage — multi-tenant Supabase (production) with SQLite fallback
 * for local dev. Same async API surface regardless of backend.
 *
 * Supabase tables: pg_connectors, pg_connector_sync_runs
 * (create via: supabase/migrations/20260629_connectors.sql)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { ConnectorConfig, ConnectorCredentials, ConnectorSettings, ConnectorType, SyncRun } from './types'

// ─── Backend selection ────────────────────────────────────────────────────────

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

let _sb: SupabaseClient | null = null
function getSb(): SupabaseClient {
  if (_sb) return _sb
  const url = process.env.SUPABASE_URL!.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
  _sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _sb
}

// ─── SQLite fallback (local dev / Electron) ───────────────────────────────────

const SQLITE_SCHEMA = `
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

let _sqlite: Database.Database | null = null
function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite
  const dir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  const path = join(dir, 'kb.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  _sqlite = new Database(path)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.exec(SQLITE_SCHEMA)
  return _sqlite
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

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

function rowToRun(r: Record<string, unknown>): SyncRun {
  return {
    id: String(r.id),
    connectorId: String(r.connector_id),
    customerId: String(r.customer_id),
    status: String(r.status) as SyncRun['status'],
    chunksProcessed: Number(r.chunks_processed),
    nodesExtracted: Number(r.nodes_extracted),
    errorMsg: r.error_msg ? String(r.error_msg) : undefined,
    startedAt: Number(r.started_at),
    completedAt: r.completed_at ? Number(r.completed_at) : undefined,
  }
}

// ─── Connector CRUD ───────────────────────────────────────────────────────────

export async function createConnector(params: {
  customerId: string
  type: ConnectorType
  label: string
  credentials: ConnectorCredentials
  settings: ConnectorSettings
}): Promise<ConnectorConfig> {
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

  if (isSupabaseConfigured()) {
    const { error } = await getSb().from('pg_connectors').insert({
      id: connector.id,
      customer_id: connector.customerId,
      type: connector.type,
      label: connector.label,
      credentials_json: JSON.stringify(connector.credentials),
      settings_json: JSON.stringify(connector.settings),
      status: 'pending_auth',
      created_at: now,
      updated_at: now,
    })
    if (error) throw new Error(`[connectors] createConnector: ${error.message}`)
  } else {
    getSqlite()
      .prepare(
        `INSERT INTO pg_connectors (id, customer_id, type, label, credentials_json, settings_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_auth', ?, ?)`
      )
      .run(connector.id, connector.customerId, connector.type, connector.label,
        JSON.stringify(connector.credentials), JSON.stringify(connector.settings), now, now)
  }
  return connector
}

export async function getConnector(id: string): Promise<ConnectorConfig | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSb().from('pg_connectors').select('*').eq('id', id).single()
    if (error || !data) return null
    return rowToConnector(data as Record<string, unknown>)
  }
  const row = getSqlite().prepare(`SELECT * FROM pg_connectors WHERE id=?`).get(id) as Record<string, unknown> | undefined
  return row ? rowToConnector(row) : null
}

export async function listConnectors(customerId: string): Promise<ConnectorConfig[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSb()
      .from('pg_connectors').select('*')
      .eq('customer_id', customerId).order('created_at', { ascending: false })
    if (error) throw new Error(`[connectors] listConnectors: ${error.message}`)
    return (data ?? []).map(r => rowToConnector(r as Record<string, unknown>))
  }
  return (getSqlite()
    .prepare(`SELECT * FROM pg_connectors WHERE customer_id=? ORDER BY created_at DESC`)
    .all(customerId) as Record<string, unknown>[]).map(rowToConnector)
}

export async function listActiveConnectors(): Promise<ConnectorConfig[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSb().from('pg_connectors').select('*').eq('status', 'active')
    if (error) throw new Error(`[connectors] listActiveConnectors: ${error.message}`)
    return (data ?? []).map(r => rowToConnector(r as Record<string, unknown>))
  }
  return (getSqlite()
    .prepare(`SELECT * FROM pg_connectors WHERE status='active'`)
    .all() as Record<string, unknown>[]).map(rowToConnector)
}

export async function updateConnectorStatus(
  id: string,
  status: ConnectorConfig['status'],
  extra?: { errorMsg?: string; lastSyncAt?: number; credentials?: ConnectorCredentials }
): Promise<void> {
  const now = Date.now()
  if (isSupabaseConfigured()) {
    const patch: Record<string, unknown> = { status, updated_at: now }
    if (extra?.errorMsg !== undefined) patch.error_msg = extra.errorMsg
    if (extra?.lastSyncAt !== undefined) patch.last_sync_at = extra.lastSyncAt
    if (extra?.credentials) patch.credentials_json = JSON.stringify(extra.credentials)
    const { error } = await getSb().from('pg_connectors').update(patch).eq('id', id)
    if (error) throw new Error(`[connectors] updateConnectorStatus: ${error.message}`)
  } else {
    getSqlite()
      .prepare(
        `UPDATE pg_connectors
         SET status=?, error_msg=COALESCE(?,error_msg), last_sync_at=COALESCE(?,last_sync_at),
             credentials_json=COALESCE(?,credentials_json), updated_at=?
         WHERE id=?`
      )
      .run(status, extra?.errorMsg ?? null, extra?.lastSyncAt ?? null,
        extra?.credentials ? JSON.stringify(extra.credentials) : null, now, id)
  }
}

export async function updateConnectorCredentials(id: string, credentials: ConnectorCredentials): Promise<void> {
  const now = Date.now()
  if (isSupabaseConfigured()) {
    const { error } = await getSb().from('pg_connectors')
      .update({ credentials_json: JSON.stringify(credentials), status: 'active', updated_at: now })
      .eq('id', id)
    if (error) throw new Error(`[connectors] updateConnectorCredentials: ${error.message}`)
  } else {
    getSqlite()
      .prepare(`UPDATE pg_connectors SET credentials_json=?, status='active', updated_at=? WHERE id=?`)
      .run(JSON.stringify(credentials), now, id)
  }
}

export async function deleteConnector(id: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await getSb().from('pg_connector_sync_runs').delete().eq('connector_id', id)
    await getSb().from('pg_connectors').delete().eq('id', id)
  } else {
    getSqlite().prepare(`DELETE FROM pg_connectors WHERE id=?`).run(id)
    getSqlite().prepare(`DELETE FROM pg_connector_sync_runs WHERE connector_id=?`).run(id)
  }
}

// ─── Sync runs ────────────────────────────────────────────────────────────────

export async function createSyncRun(connectorId: string, customerId: string): Promise<SyncRun> {
  const run: SyncRun = {
    id: randomUUID(),
    connectorId,
    customerId,
    status: 'running',
    chunksProcessed: 0,
    nodesExtracted: 0,
    startedAt: Date.now(),
  }
  if (isSupabaseConfigured()) {
    const { error } = await getSb().from('pg_connector_sync_runs').insert({
      id: run.id, connector_id: run.connectorId, customer_id: run.customerId,
      status: 'running', chunks_processed: 0, nodes_extracted: 0, started_at: run.startedAt,
    })
    if (error) throw new Error(`[connectors] createSyncRun: ${error.message}`)
  } else {
    getSqlite()
      .prepare(
        `INSERT INTO pg_connector_sync_runs (id, connector_id, customer_id, status, chunks_processed, nodes_extracted, started_at)
         VALUES (?, ?, ?, 'running', 0, 0, ?)`
      )
      .run(run.id, run.connectorId, run.customerId, run.startedAt)
  }
  return run
}

export async function completeSyncRun(
  id: string,
  result: { chunksProcessed: number; nodesExtracted: number; error?: string }
): Promise<void> {
  const now = Date.now()
  if (isSupabaseConfigured()) {
    const { error } = await getSb().from('pg_connector_sync_runs').update({
      status: result.error ? 'error' : 'done',
      chunks_processed: result.chunksProcessed,
      nodes_extracted: result.nodesExtracted,
      error_msg: result.error ?? null,
      completed_at: now,
    }).eq('id', id)
    if (error) throw new Error(`[connectors] completeSyncRun: ${error.message}`)
  } else {
    getSqlite()
      .prepare(
        `UPDATE pg_connector_sync_runs
         SET status=?, chunks_processed=?, nodes_extracted=?, error_msg=?, completed_at=?
         WHERE id=?`
      )
      .run(result.error ? 'error' : 'done', result.chunksProcessed, result.nodesExtracted,
        result.error ?? null, now, id)
  }
}

export async function listSyncRuns(connectorId: string, limit = 20): Promise<SyncRun[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSb()
      .from('pg_connector_sync_runs').select('*')
      .eq('connector_id', connectorId).order('started_at', { ascending: false }).limit(limit)
    if (error) throw new Error(`[connectors] listSyncRuns: ${error.message}`)
    return (data ?? []).map(r => rowToRun(r as Record<string, unknown>))
  }
  return (getSqlite()
    .prepare(`SELECT * FROM pg_connector_sync_runs WHERE connector_id=? ORDER BY started_at DESC LIMIT ?`)
    .all(connectorId, limit) as Record<string, unknown>[]).map(rowToRun)
}
