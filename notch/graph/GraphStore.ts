import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import type { DealFixture, ExtractedSignal } from '../simulation/types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT,
  name TEXT,
  metadata TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  from_id TEXT,
  to_id TEXT,
  type TEXT,
  weight REAL,
  source TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  deal_id TEXT,
  entity_id TEXT,
  type TEXT,
  content TEXT,
  source TEXT,
  source_ref TEXT,
  confidence REAL,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  deal_id TEXT,
  phase TEXT,
  transcript TEXT,
  summary TEXT,
  signals_extracted TEXT,
  started_at INTEGER,
  ended_at INTEGER
);
`

export class GraphStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const path = dbPath ?? join(homedir(), '.notch', 'graph.sqlite')
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.exec(SCHEMA)
  }

  ingestDeal(deal: DealFixture): void {
    const now = Date.now()
    const dealMeta = JSON.stringify({
      stage: deal.stage,
      acv: deal.acv,
      seats: deal.seats,
      close_target: deal.close_target
    })

    this.db
      .prepare(
        `INSERT OR REPLACE INTO entities (id, type, name, metadata, created_at, updated_at)
         VALUES (?, 'deal', ?, ?, ?, ?)`
      )
      .run(deal.id, deal.company, dealMeta, now, now)

    for (const c of deal.contacts) {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO entities (id, type, name, metadata, created_at, updated_at)
           VALUES (?, 'person', ?, ?, ?, ?)`
        )
        .run(c.id, c.name, JSON.stringify(c), now, now)

      this.db
        .prepare(
          `INSERT OR REPLACE INTO edges (id, from_id, to_id, type, weight, source, created_at)
           VALUES (?, ?, ?, 'works_at', 1, 'simulation', ?)`
        )
        .run(`${c.id}-${deal.id}`, c.id, deal.id, now)
    }

    for (const s of deal.signals) {
      const sid = `sig-${deal.id}-${s.type}-${s.content.slice(0, 12)}`
      this.db
        .prepare(
          `INSERT OR REPLACE INTO signals (id, deal_id, entity_id, type, content, source, source_ref, confidence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(sid, deal.id, deal.id, s.type, s.content, s.source, '', s.confidence, now)
    }
  }

  addSessionSignals(dealId: string, sessionId: string, signals: ExtractedSignal[]): void {
    const now = Date.now()
    for (const s of signals) {
      const sid = `live-${sessionId}-${s.type}-${now}-${Math.random().toString(36).slice(2, 6)}`
      this.db
        .prepare(
          `INSERT INTO signals (id, deal_id, entity_id, type, content, source, source_ref, confidence, created_at)
           VALUES (?, ?, ?, ?, ?, 'transcript', ?, ?, ?)`
        )
        .run(sid, dealId, dealId, s.type, s.content, sessionId, s.confidence, now)
    }
  }

  saveSession(
    id: string,
    dealId: string,
    phase: string,
    transcript: string,
    summary: string,
    signals: ExtractedSignal[]
  ): void {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (id, deal_id, phase, transcript, summary, signals_extracted, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, dealId, phase, transcript, summary, JSON.stringify(signals), now - 3600000, now)
  }

  getSignalsForDeal(dealId: string): ExtractedSignal[] {
    return this.db
      .prepare(`SELECT type, content, confidence FROM signals WHERE deal_id = ? ORDER BY created_at DESC LIMIT 20`)
      .all(dealId) as ExtractedSignal[]
  }

  close(): void {
    this.db.close()
  }
}
