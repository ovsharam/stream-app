import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  IngestJob,
  IngestJobStatus,
  ProductEdge,
  ProductNode,
  ProductNodeLabel,
  ReviewQueueItem,
  ReviewStatus
} from '../../shared/product-graph'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pg_ingest_jobs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  chunk_count INTEGER,
  node_count INTEGER,
  error_msg TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_jobs_customer ON pg_ingest_jobs(customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS pg_review_queue (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  label TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_doc_id TEXT NOT NULL,
  properties_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  edited_name TEXT,
  edited_description TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pg_review_customer ON pg_review_queue(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_pg_review_job ON pg_review_queue(job_id);

CREATE TABLE IF NOT EXISTS pg_product_nodes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  label TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  source_doc_id TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  properties_json TEXT NOT NULL DEFAULT '{}',
  written_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_nodes_customer ON pg_product_nodes(customer_id, label);

CREATE TABLE IF NOT EXISTS pg_product_edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  customer_id TEXT NOT NULL,
  written_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pg_edges_customer ON pg_product_edges(customer_id);
CREATE INDEX IF NOT EXISTS idx_pg_edges_from ON pg_product_edges(from_id);

CREATE VIRTUAL TABLE IF NOT EXISTS pg_nodes_fts USING fts5(
  name,
  description,
  label UNINDEXED,
  node_id UNINDEXED,
  customer_id UNINDEXED,
  tokenize='porter ascii'
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

// ─── Jobs ────────────────────────────────────────────────────────────────────

export function createIngestJob(params: {
  customerId: string
  fileName: string
  mimeType: string
}): IngestJob {
  const database = getDb()
  const now = Date.now()
  const job: IngestJob = {
    id: randomUUID(),
    customerId: params.customerId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  }
  database
    .prepare(
      `INSERT INTO pg_ingest_jobs (id, customer_id, file_name, mime_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(job.id, job.customerId, job.fileName, job.mimeType, now, now)
  return job
}

export function updateJobStatus(
  jobId: string,
  status: IngestJobStatus,
  extra?: { chunkCount?: number; nodeCount?: number; errorMsg?: string }
): void {
  const database = getDb()
  database
    .prepare(
      `UPDATE pg_ingest_jobs
       SET status=?, chunk_count=COALESCE(?, chunk_count), node_count=COALESCE(?, node_count),
           error_msg=COALESCE(?, error_msg), updated_at=?
       WHERE id=?`
    )
    .run(
      status,
      extra?.chunkCount ?? null,
      extra?.nodeCount ?? null,
      extra?.errorMsg ?? null,
      Date.now(),
      jobId
    )
}

export function getJob(jobId: string): IngestJob | null {
  const row = getDb()
    .prepare(`SELECT * FROM pg_ingest_jobs WHERE id=?`)
    .get(jobId) as Record<string, unknown> | undefined
  return row ? rowToJob(row) : null
}

export function listJobs(customerId: string, limit = 50): IngestJob[] {
  return (
    getDb()
      .prepare(`SELECT * FROM pg_ingest_jobs WHERE customer_id=? ORDER BY updated_at DESC LIMIT ?`)
      .all(customerId, limit) as Record<string, unknown>[]
  ).map(rowToJob)
}

function rowToJob(r: Record<string, unknown>): IngestJob {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    fileName: String(r.file_name),
    mimeType: String(r.mime_type),
    status: String(r.status) as IngestJobStatus,
    chunkCount: r.chunk_count != null ? Number(r.chunk_count) : undefined,
    nodeCount: r.node_count != null ? Number(r.node_count) : undefined,
    errorMsg: r.error_msg ? String(r.error_msg) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }
}

// ─── Review queue ─────────────────────────────────────────────────────────────

export function insertReviewItems(items: Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[]): ReviewQueueItem[] {
  const database = getDb()
  const now = Date.now()
  const insert = database.prepare(
    `INSERT INTO pg_review_queue
     (id, customer_id, job_id, label, name, description, confidence, source_doc_id, properties_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  )
  const all = database.transaction((rows: typeof items) => {
    return rows.map((item) => {
      const id = randomUUID()
      insert.run(
        id,
        item.customerId,
        item.jobId,
        item.label,
        item.name,
        item.description,
        item.confidence,
        item.sourceDocId,
        JSON.stringify(item.properties ?? {}),
        now
      )
      return { ...item, id, status: 'pending' as ReviewStatus, createdAt: now }
    })
  })
  return all(items)
}

export function listReviewItems(customerId: string, status?: ReviewStatus): ReviewQueueItem[] {
  const database = getDb()
  const rows = status
    ? (database
        .prepare(`SELECT * FROM pg_review_queue WHERE customer_id=? AND status=? ORDER BY confidence DESC, created_at ASC`)
        .all(customerId, status) as Record<string, unknown>[])
    : (database
        .prepare(`SELECT * FROM pg_review_queue WHERE customer_id=? ORDER BY status='pending' DESC, confidence DESC, created_at ASC`)
        .all(customerId) as Record<string, unknown>[])
  return rows.map(rowToReview)
}

export function updateReviewItem(
  id: string,
  update: { status: ReviewStatus; editedName?: string; editedDescription?: string }
): ReviewQueueItem | null {
  const database = getDb()
  database
    .prepare(
      `UPDATE pg_review_queue
       SET status=?, edited_name=COALESCE(?, edited_name), edited_description=COALESCE(?, edited_description), reviewed_at=?
       WHERE id=?`
    )
    .run(
      update.status,
      update.editedName ?? null,
      update.editedDescription ?? null,
      Date.now(),
      id
    )
  const row = database
    .prepare(`SELECT * FROM pg_review_queue WHERE id=?`)
    .get(id) as Record<string, unknown> | undefined
  return row ? rowToReview(row) : null
}

export function getApprovedItems(jobId: string): ReviewQueueItem[] {
  return (
    getDb()
      .prepare(`SELECT * FROM pg_review_queue WHERE job_id=? AND status='approved'`)
      .all(jobId) as Record<string, unknown>[]
  ).map(rowToReview)
}

function rowToReview(r: Record<string, unknown>): ReviewQueueItem {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    jobId: String(r.job_id),
    label: String(r.label) as ProductNodeLabel,
    name: String(r.name),
    description: String(r.description),
    confidence: Number(r.confidence),
    sourceDocId: String(r.source_doc_id),
    properties: JSON.parse(String(r.properties_json ?? '{}')),
    status: String(r.status) as ReviewStatus,
    editedName: r.edited_name ? String(r.edited_name) : undefined,
    editedDescription: r.edited_description ? String(r.edited_description) : undefined,
    createdAt: Number(r.created_at),
    reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : undefined
  }
}

// ─── Product nodes (approved, committed) ─────────────────────────────────────

export function upsertProductNode(node: ProductNode): void {
  const database = getDb()
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO pg_product_nodes (id, customer_id, label, name, description, source_doc_id, confidence, properties_json, written_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
         confidence=excluded.confidence, properties_json=excluded.properties_json, written_at=excluded.written_at`
    )
    .run(
      node.id,
      node.customerId,
      node.label,
      node.name,
      node.description,
      node.sourceDocId,
      node.confidence,
      JSON.stringify(node.properties ?? {}),
      now
    )
  // Update FTS
  database.prepare(`DELETE FROM pg_nodes_fts WHERE node_id=?`).run(node.id)
  database
    .prepare(`INSERT INTO pg_nodes_fts (name, description, label, node_id, customer_id) VALUES (?, ?, ?, ?, ?)`)
    .run(node.name, node.description, node.label, node.id, node.customerId)
}

export function upsertProductEdge(edge: ProductEdge): void {
  const database = getDb()
  database
    .prepare(
      `INSERT INTO pg_product_edges (id, from_id, to_id, type, weight, customer_id, written_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET weight=excluded.weight, written_at=excluded.written_at`
    )
    .run(edge.id, edge.fromId, edge.toId, edge.type, edge.weight ?? 1.0, edge.customerId, Date.now())
}

export function searchProductNodes(customerId: string, query: string, limit = 20): ProductNode[] {
  const database = getDb()
  const ftsQuery = query.trim().split(/\s+/).map(t => `"${t.replace(/"/g, '')}"`).join(' OR ')
  const rows = database
    .prepare(
      `SELECT n.* FROM pg_product_nodes n
       JOIN pg_nodes_fts f ON n.id = f.node_id
       WHERE f.customer_id=? AND pg_nodes_fts MATCH ?
       ORDER BY bm25(pg_nodes_fts) LIMIT ?`
    )
    .all(customerId, ftsQuery, limit) as Record<string, unknown>[]
  return rows.map(rowToNode)
}

export function listProductNodes(customerId: string, label?: ProductNodeLabel): ProductNode[] {
  const database = getDb()
  const rows = label
    ? (database
        .prepare(`SELECT * FROM pg_product_nodes WHERE customer_id=? AND label=? ORDER BY name`)
        .all(customerId, label) as Record<string, unknown>[])
    : (database
        .prepare(`SELECT * FROM pg_product_nodes WHERE customer_id=? ORDER BY label, name`)
        .all(customerId) as Record<string, unknown>[])
  return rows.map(rowToNode)
}

export function getProductEdges(customerId: string, nodeIds?: string[]): ProductEdge[] {
  const database = getDb()
  if (nodeIds && nodeIds.length > 0) {
    const placeholders = nodeIds.map(() => '?').join(',')
    const rows = database
      .prepare(
        `SELECT * FROM pg_product_edges WHERE customer_id=? AND (from_id IN (${placeholders}) OR to_id IN (${placeholders}))`
      )
      .all(customerId, ...nodeIds, ...nodeIds) as Record<string, unknown>[]
    return rows.map(rowToEdge)
  }
  return (
    database
      .prepare(`SELECT * FROM pg_product_edges WHERE customer_id=? ORDER BY written_at DESC`)
      .all(customerId) as Record<string, unknown>[]
  ).map(rowToEdge)
}

export function getProductGraphStats(customerId: string) {
  const database = getDb()
  const nodes = database
    .prepare(`SELECT label, COUNT(*) as cnt FROM pg_product_nodes WHERE customer_id=? GROUP BY label`)
    .all(customerId) as { label: string; cnt: number }[]
  const totalNodes = nodes.reduce((s, r) => s + r.cnt, 0)
  const byLabel: Record<string, number> = {}
  for (const r of nodes) byLabel[r.label] = r.cnt
  const totalEdges = (
    database
      .prepare(`SELECT COUNT(*) as cnt FROM pg_product_edges WHERE customer_id=?`)
      .get(customerId) as { cnt: number }
  ).cnt
  const lastRow = database
    .prepare(`SELECT MAX(written_at) as ts FROM pg_product_nodes WHERE customer_id=?`)
    .get(customerId) as { ts: number | null }
  return { customerId, totalNodes, byLabel, totalEdges, lastUpdated: lastRow.ts ?? undefined }
}

function rowToNode(r: Record<string, unknown>): ProductNode {
  return {
    id: String(r.id),
    customerId: String(r.customer_id),
    label: String(r.label) as ProductNodeLabel,
    name: String(r.name),
    description: String(r.description),
    confidence: Number(r.confidence),
    sourceDocId: String(r.source_doc_id),
    properties: JSON.parse(String(r.properties_json ?? '{}'))
  }
}

function rowToEdge(r: Record<string, unknown>): ProductEdge {
  return {
    id: String(r.id),
    fromId: String(r.from_id),
    toId: String(r.to_id),
    type: String(r.type) as ProductEdge['type'],
    weight: Number(r.weight),
    customerId: String(r.customer_id)
  }
}
