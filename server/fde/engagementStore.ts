import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  EscalationLevel,
  FdeEngagement,
  EngagementStage,
  ScopeBucket
} from '../../shared/fde-engagement'
import type { MeetingExtraction } from '../cluster/meetingPipeline'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fde_engagements (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  company TEXT,
  stage TEXT NOT NULL,
  scope TEXT NOT NULL,
  summary TEXT,
  build_prompt TEXT,
  next_steps_json TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  open_questions_json TEXT NOT NULL,
  meeting_ids_json TEXT NOT NULL,
  feed_item_ids_json TEXT NOT NULL,
  google_doc_url TEXT,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_engagements_updated ON fde_engagements(updated_at DESC);
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

function rowToEngagement(r: Record<string, unknown>): FdeEngagement {
  return {
    id: String(r.id),
    clientName: String(r.client_name),
    company: r.company ? String(r.company) : undefined,
    stage: String(r.stage) as EngagementStage,
    scope: String(r.scope) as ScopeBucket,
    summary: r.summary ? String(r.summary) : undefined,
    buildPrompt: r.build_prompt ? String(r.build_prompt) : undefined,
    nextSteps: JSON.parse(String(r.next_steps_json)) as string[],
    flags: JSON.parse(String(r.flags_json)) as string[],
    openQuestions: JSON.parse(String(r.open_questions_json)) as string[],
    meetingIds: JSON.parse(String(r.meeting_ids_json)) as string[],
    feedItemIds: JSON.parse(String(r.feed_item_ids_json)) as string[],
    googleDocUrl: r.google_doc_url ? String(r.google_doc_url) : undefined,
    escalationLevel: Number(r.escalation_level) as EscalationLevel,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }
}

export function listEngagements(limit = 50): FdeEngagement[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_engagements ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map(rowToEngagement)
}

export function countEngagements(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM fde_engagements').get() as { n: number }
  return Number(row?.n ?? 0)
}

export function getEngagement(id: string): FdeEngagement | null {
  const row = getDb().prepare(`SELECT * FROM fde_engagements WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToEngagement(row) : null
}

export function upsertEngagement(
  input: Partial<FdeEngagement> & { clientName: string },
  trainingMeta?: { sessionId?: string; extraction?: MeetingExtraction }
): FdeEngagement {
  const now = Date.now()
  const existing = input.id ? getEngagement(input.id) : null
  const id = input.id ?? `eng-${randomUUID()}`

  const engagement: FdeEngagement = {
    id,
    clientName: input.clientName,
    company: input.company ?? existing?.company,
    stage: input.stage ?? existing?.stage ?? 'intake',
    scope: input.scope ?? existing?.scope ?? 'unknown',
    summary: input.summary ?? existing?.summary,
    buildPrompt: input.buildPrompt ?? existing?.buildPrompt,
    nextSteps: input.nextSteps ?? existing?.nextSteps ?? [],
    flags: input.flags ?? existing?.flags ?? [],
    openQuestions: input.openQuestions ?? existing?.openQuestions ?? [],
    meetingIds: input.meetingIds ?? existing?.meetingIds ?? [],
    feedItemIds: input.feedItemIds ?? existing?.feedItemIds ?? [],
    googleDocUrl: input.googleDocUrl ?? existing?.googleDocUrl,
    escalationLevel: input.escalationLevel ?? existing?.escalationLevel ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  getDb()
    .prepare(
      `INSERT INTO fde_engagements
       (id, client_name, company, stage, scope, summary, build_prompt,
        next_steps_json, flags_json, open_questions_json, meeting_ids_json, feed_item_ids_json,
        google_doc_url, escalation_level, created_at, updated_at)
       VALUES (@id, @client_name, @company, @stage, @scope, @summary, @build_prompt,
        @next_steps_json, @flags_json, @open_questions_json, @meeting_ids_json, @feed_item_ids_json,
        @google_doc_url, @escalation_level, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
        client_name=excluded.client_name, company=excluded.company, stage=excluded.stage,
        scope=excluded.scope, summary=excluded.summary, build_prompt=excluded.build_prompt,
        next_steps_json=excluded.next_steps_json, flags_json=excluded.flags_json,
        open_questions_json=excluded.open_questions_json, meeting_ids_json=excluded.meeting_ids_json,
        feed_item_ids_json=excluded.feed_item_ids_json, google_doc_url=excluded.google_doc_url,
        escalation_level=excluded.escalation_level, updated_at=excluded.updated_at`
    )
    .run({
      id: engagement.id,
      client_name: engagement.clientName,
      company: engagement.company ?? null,
      stage: engagement.stage,
      scope: engagement.scope,
      summary: engagement.summary ?? null,
      build_prompt: engagement.buildPrompt ?? null,
      next_steps_json: JSON.stringify(engagement.nextSteps),
      flags_json: JSON.stringify(engagement.flags),
      open_questions_json: JSON.stringify(engagement.openQuestions),
      meeting_ids_json: JSON.stringify(engagement.meetingIds),
      feed_item_ids_json: JSON.stringify(engagement.feedItemIds),
      google_doc_url: engagement.googleDocUrl ?? null,
      escalation_level: engagement.escalationLevel,
      created_at: engagement.createdAt,
      updated_at: engagement.updatedAt
    })

  try {
    const { captureEngagementUpsert } = require('./trainingLog') as typeof import('./trainingLog')
    const extraction =
      trainingMeta?.extraction ??
      (input.summary !== undefined ||
      input.buildPrompt !== undefined ||
      input.scope !== undefined
        ? {
            summary: engagement.summary ?? '',
            buildPrompt: engagement.buildPrompt ?? '',
            nextSteps: engagement.nextSteps,
            flags: engagement.flags,
            decisions: [] as string[],
            questions: engagement.openQuestions,
            scopeDecision: engagement.scope
          }
        : undefined)
    captureEngagementUpsert({
      previous: existing,
      next: engagement,
      sessionId: trainingMeta?.sessionId,
      extraction
    })
  } catch {
    /* training capture optional */
  }

  return engagement
}

export function upsertEngagementFromMeeting(input: {
  sessionId: string
  feedItemId: string
  title?: string
  dealHint?: string
  extraction: MeetingExtraction
  googleDocUrl?: string
}): FdeEngagement {
  const clientName =
    input.dealHint?.trim() ||
    input.title?.replace(/^Meeting ·\s*/i, '').trim() ||
    `Client · ${new Date().toLocaleDateString()}`

  const existing = listEngagements(200).find(
    (e) =>
      e.clientName.toLowerCase() === clientName.toLowerCase() ||
      (input.dealHint && e.company?.toLowerCase() === input.dealHint.toLowerCase())
  )

  const scope = input.extraction.scopeDecision
  const stage: EngagementStage =
    existing?.stage === 'maintenance'
      ? 'maintenance'
      : scope === 'unknown'
        ? 'intake'
        : 'build'

  const meetingIds = [...new Set([...(existing?.meetingIds ?? []), input.sessionId])]
  const feedItemIds = [...new Set([...(existing?.feedItemIds ?? []), input.feedItemId])]

  return upsertEngagement({
    id: existing?.id,
    clientName: existing?.clientName ?? clientName,
    company: input.dealHint ?? existing?.company,
    stage,
    scope,
    summary: input.extraction.summary,
    buildPrompt: input.extraction.buildPrompt,
    nextSteps: input.extraction.nextSteps,
    flags: input.extraction.flags,
    openQuestions: input.extraction.questions,
    meetingIds,
    feedItemIds,
    googleDocUrl: input.googleDocUrl ?? existing?.googleDocUrl,
    escalationLevel:
      input.extraction.flags.length > 2 ? 1 : (existing?.escalationLevel ?? 0)
  }, { sessionId: input.sessionId, extraction: input.extraction })
}
