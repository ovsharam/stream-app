import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  IntentionEpisode,
  IntentionEpisodeOutcome,
  IntentionEpisodeStats,
  IntentionEpisodeStatus,
  IntentionStimulusType
} from '../../shared/intention-episode'
import type { IntentionVector } from '../../shared/personal-kb'

const STATS_SAMPLE_CAP = 800

const SCHEMA = `
CREATE TABLE IF NOT EXISTS intention_episodes (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  correlation_id TEXT,
  stimulus_type TEXT NOT NULL,
  stimulus_id TEXT NOT NULL,
  stimulus_source TEXT,
  stimulus_label TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,
  outcome TEXT,
  event_chain_json TEXT NOT NULL,
  event_ids_json TEXT NOT NULL,
  latencies_json TEXT NOT NULL,
  commitment_depth INTEGER NOT NULL,
  behavioral_weight REAL NOT NULL,
  reaction_tier TEXT,
  text_intention_json TEXT,
  dominant_intention TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_started ON intention_episodes(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_status ON intention_episodes(status);
CREATE INDEX IF NOT EXISTS idx_intention_episodes_stimulus ON intention_episodes(stimulus_type, stimulus_id);

CREATE TABLE IF NOT EXISTS intention_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  const dataDir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  const path = join(dataDir, 'intention-episodes.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

export function initIntentionEpisodeStore(): void {
  getDb()
}

type Row = {
  id: string
  operator_id: string
  session_id: string
  correlation_id: string | null
  stimulus_type: string
  stimulus_id: string
  stimulus_source: string | null
  stimulus_label: string | null
  started_at: number
  ended_at: number | null
  status: string
  outcome: string | null
  event_chain_json: string
  event_ids_json: string
  latencies_json: string
  commitment_depth: number
  behavioral_weight: number
  reaction_tier: string | null
  text_intention_json: string | null
  dominant_intention: string | null
}

function rowToEpisode(row: Row): IntentionEpisode {
  return {
    id: row.id,
    operatorId: row.operator_id,
    sessionId: row.session_id,
    correlationId: row.correlation_id ?? undefined,
    stimulusType: row.stimulus_type as IntentionStimulusType,
    stimulusId: row.stimulus_id,
    stimulusSource: row.stimulus_source ?? undefined,
    stimulusLabel: row.stimulus_label ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status as IntentionEpisodeStatus,
    outcome: (row.outcome as IntentionEpisodeOutcome | null) ?? undefined,
    eventChain: JSON.parse(row.event_chain_json) as string[],
    eventIds: JSON.parse(row.event_ids_json) as string[],
    latencies: JSON.parse(row.latencies_json),
    commitmentDepth: row.commitment_depth,
    behavioralWeight: row.behavioral_weight,
    reactionTier: (row.reaction_tier as IntentionEpisode['reactionTier']) ?? undefined,
    textIntention: row.text_intention_json
      ? (JSON.parse(row.text_intention_json) as IntentionVector)
      : undefined,
    dominantIntention: (row.dominant_intention as IntentionEpisode['dominantIntention']) ?? undefined
  }
}

export function upsertEpisode(episode: IntentionEpisode): void {
  const d = getDb()
  const now = Date.now()
  d.prepare(
    `
    INSERT INTO intention_episodes (
      id, operator_id, session_id, correlation_id, stimulus_type, stimulus_id,
      stimulus_source, stimulus_label, started_at, ended_at, status, outcome,
      event_chain_json, event_ids_json, latencies_json, commitment_depth,
      behavioral_weight, reaction_tier, text_intention_json, dominant_intention,
      created_at, updated_at
    ) VALUES (
      @id, @operator_id, @session_id, @correlation_id, @stimulus_type, @stimulus_id,
      @stimulus_source, @stimulus_label, @started_at, @ended_at, @status, @outcome,
      @event_chain_json, @event_ids_json, @latencies_json, @commitment_depth,
      @behavioral_weight, @reaction_tier, @text_intention_json, @dominant_intention,
      @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      ended_at = excluded.ended_at,
      status = excluded.status,
      outcome = excluded.outcome,
      event_chain_json = excluded.event_chain_json,
      event_ids_json = excluded.event_ids_json,
      latencies_json = excluded.latencies_json,
      commitment_depth = excluded.commitment_depth,
      behavioral_weight = excluded.behavioral_weight,
      reaction_tier = excluded.reaction_tier,
      text_intention_json = excluded.text_intention_json,
      dominant_intention = excluded.dominant_intention,
      updated_at = excluded.updated_at
  `
  ).run({
    id: episode.id,
    operator_id: episode.operatorId,
    session_id: episode.sessionId,
    correlation_id: episode.correlationId ?? null,
    stimulus_type: episode.stimulusType,
    stimulus_id: episode.stimulusId,
    stimulus_source: episode.stimulusSource ?? null,
    stimulus_label: episode.stimulusLabel ?? null,
    started_at: episode.startedAt,
    ended_at: episode.endedAt ?? null,
    status: episode.status,
    outcome: episode.outcome ?? null,
    event_chain_json: JSON.stringify(episode.eventChain),
    event_ids_json: JSON.stringify(episode.eventIds),
    latencies_json: JSON.stringify(episode.latencies),
    commitment_depth: episode.commitmentDepth,
    behavioral_weight: episode.behavioralWeight,
    reaction_tier: episode.reactionTier ?? null,
    text_intention_json: episode.textIntention ? JSON.stringify(episode.textIntention) : null,
    dominant_intention: episode.dominantIntention ?? null,
    created_at: now,
    updated_at: now
  })
}

export function listRecentEpisodes(limit = 40): IntentionEpisode[] {
  const rows = getDb()
    .prepare('SELECT * FROM intention_episodes ORDER BY started_at DESC LIMIT ?')
    .all(limit) as Row[]
  return rows.map(rowToEpisode)
}

export function listOpenEpisodes(): IntentionEpisode[] {
  const rows = getDb()
    .prepare("SELECT * FROM intention_episodes WHERE status = 'open' ORDER BY started_at ASC")
    .all() as Row[]
  return rows.map(rowToEpisode)
}

export function countEpisodes(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM intention_episodes').get() as { n: number }
  return Number(row?.n ?? 0)
}

export function getEpisodeMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM intention_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setEpisodeMeta(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO intention_meta (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run({ key, value })
}

export function clearAllEpisodes(): void {
  getDb().exec('DELETE FROM intention_episodes')
}

export function clearEpisodeMeta(key: string): void {
  getDb().prepare('DELETE FROM intention_meta WHERE key = ?').run(key)
}

/** All episodes for cloud export — ordered newest first. */
export function listAllEpisodes(limit = 50_000): IntentionEpisode[] {
  const rows = getDb()
    .prepare('SELECT * FROM intention_episodes ORDER BY started_at DESC LIMIT ?')
    .all(limit) as Row[]
  return rows.map(rowToEpisode)
}

export function listClosedEpisodesForStats(limit = STATS_SAMPLE_CAP): IntentionEpisode[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM intention_episodes WHERE status = 'closed' ORDER BY ended_at DESC LIMIT ?`
    )
    .all(limit) as Row[]
  return rows.map(rowToEpisode)
}

function countByStatus(status: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM intention_episodes WHERE status = ?')
    .get(status) as { n: number }
  return Number(row?.n ?? 0)
}

function countByOutcome(outcome: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM intention_episodes WHERE status = 'closed' AND outcome = ?")
    .get(outcome) as { n: number }
  return Number(row?.n ?? 0)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function computeEpisodeStats(): IntentionEpisodeStats {
  const total = countEpisodes()
  const open = countByStatus('open')
  const closed = countByStatus('closed')
  const committed = countByOutcome('committed')
  const engaged = countByOutcome('engaged')
  const abandoned = countByOutcome('abandoned')
  const ignored = countByOutcome('ignored')

  const sample = listClosedEpisodesForStats()
  const reactions = sample
    .map((e) => e.latencies.reactionMs)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
  const weights = sample.map((e) => e.behavioralWeight)

  const chainCounts = new Map<string, number>()
  for (const ep of sample) {
    if (ep.eventChain.length < 2) continue
    const key = ep.eventChain.join('>')
    chainCounts.set(key, (chainCounts.get(key) ?? 0) + 1)
  }
  const topChains = [...chainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([chain, count]) => ({ chain: chain.replace(/>/g, ' → '), count }))

  const bySource = new Map<string, number[]>()
  for (const ep of sample) {
    if (ep.stimulusType !== 'stream_item') continue
    const src = ep.stimulusSource
    if (!src || src === 'unknown') continue
    const ms = ep.latencies.reactionMs
    if (ms == null || ms <= 0) continue
    const list = bySource.get(src) ?? []
    list.push(ms)
    bySource.set(src, list)
  }
  const reactionBySource = [...bySource.entries()]
    .map(([source, values]) => ({ source, medianMs: Math.round(median(values)), count: values.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  return {
    total,
    open,
    closed,
    committed,
    engaged,
    abandoned,
    ignored,
    avgBehavioralWeight:
      weights.length > 0 ? weights.reduce((a, b) => a + b, 0) / weights.length : 0,
    avgReactionMs:
      reactions.length > 0 ? reactions.reduce((a, b) => a + b, 0) / reactions.length : 0,
    statsSampleSize: sample.length,
    topChains,
    reactionBySource
  }
}
