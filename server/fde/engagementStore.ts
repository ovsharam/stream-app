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
import { computeContextScore, normalizeEngagementStage } from '../../shared/fde-context'
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
  migrateEngagementColumns(db)
  return db
}

function migrateEngagementColumns(database: Database.Database): void {
  const cols = database.prepare(`PRAGMA table_info(fde_engagements)`).all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('proposal_ids_json')) {
    database.exec(`ALTER TABLE fde_engagements ADD COLUMN proposal_ids_json TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!names.has('signal_sources_json')) {
    database.exec(`ALTER TABLE fde_engagements ADD COLUMN signal_sources_json TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!names.has('context_score')) {
    database.exec(`ALTER TABLE fde_engagements ADD COLUMN context_score INTEGER`)
  }
  database.exec(`UPDATE fde_engagements SET stage='deploy' WHERE stage='maintenance'`)
}

function rowToEngagement(r: Record<string, unknown>): FdeEngagement {
  const engagement: FdeEngagement = {
    id: String(r.id),
    clientName: String(r.client_name),
    company: r.company ? String(r.company) : undefined,
    stage: normalizeEngagementStage(String(r.stage)),
    scope: String(r.scope) as ScopeBucket,
    summary: r.summary ? String(r.summary) : undefined,
    buildPrompt: r.build_prompt ? String(r.build_prompt) : undefined,
    nextSteps: JSON.parse(String(r.next_steps_json)) as string[],
    flags: JSON.parse(String(r.flags_json)) as string[],
    openQuestions: JSON.parse(String(r.open_questions_json)) as string[],
    meetingIds: JSON.parse(String(r.meeting_ids_json)) as string[],
    feedItemIds: JSON.parse(String(r.feed_item_ids_json)) as string[],
    proposalIds: JSON.parse(String(r.proposal_ids_json ?? '[]')) as string[],
    signalSources: JSON.parse(String(r.signal_sources_json ?? '[]')) as FdeEngagement['signalSources'],
    googleDocUrl: r.google_doc_url ? String(r.google_doc_url) : undefined,
    escalationLevel: Number(r.escalation_level) as EscalationLevel,
    contextScore: r.context_score != null ? Number(r.context_score) : undefined,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }
  if (engagement.contextScore == null) {
    engagement.contextScore = computeContextScore(engagement)
  }
  return engagement
}

export function deleteEngagement(id: string): boolean {
  const result = getDb().prepare(`DELETE FROM fde_engagements WHERE id = ?`).run(id)
  return result.changes > 0
}

export function listEngagements(limit = 50): FdeEngagement[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_engagements ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map(rowToEngagement)
}

export function listEngagementsByClient(): { clientName: string; engagements: FdeEngagement[] }[] {
  const all = listEngagements(500)
  const map = new Map<string, FdeEngagement[]>()
  for (const e of all) {
    const key = e.clientName.trim()
    const list = map.get(key) ?? []
    list.push(e)
    map.set(key, list)
  }
  return [...map.entries()]
    .map(([clientName, engagements]) => ({
      clientName,
      engagements: engagements.sort((a, b) => b.updatedAt - a.updatedAt)
    }))
    .sort((a, b) => {
      const ta = a.engagements[0]?.updatedAt ?? 0
      const tb = b.engagements[0]?.updatedAt ?? 0
      return tb - ta
    })
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
    stage: normalizeEngagementStage(input.stage ?? existing?.stage ?? 'intake'),
    scope: input.scope ?? existing?.scope ?? 'unknown',
    summary: input.summary ?? existing?.summary,
    buildPrompt: input.buildPrompt ?? existing?.buildPrompt,
    nextSteps: input.nextSteps ?? existing?.nextSteps ?? [],
    flags: input.flags ?? existing?.flags ?? [],
    openQuestions: input.openQuestions ?? existing?.openQuestions ?? [],
    meetingIds: input.meetingIds ?? existing?.meetingIds ?? [],
    feedItemIds: input.feedItemIds ?? existing?.feedItemIds ?? [],
    proposalIds: input.proposalIds ?? existing?.proposalIds ?? [],
    signalSources: input.signalSources ?? existing?.signalSources ?? [],
    googleDocUrl: input.googleDocUrl ?? existing?.googleDocUrl,
    escalationLevel: input.escalationLevel ?? existing?.escalationLevel ?? 0,
    contextScore: input.contextScore ?? existing?.contextScore,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  if (input.contextScore === undefined) {
    engagement.contextScore = computeContextScore(engagement)
  }

  getDb()
    .prepare(
      `INSERT INTO fde_engagements
       (id, client_name, company, stage, scope, summary, build_prompt,
        next_steps_json, flags_json, open_questions_json, meeting_ids_json, feed_item_ids_json,
        proposal_ids_json, signal_sources_json,
        google_doc_url, escalation_level, context_score, created_at, updated_at)
       VALUES (@id, @client_name, @company, @stage, @scope, @summary, @build_prompt,
        @next_steps_json, @flags_json, @open_questions_json, @meeting_ids_json, @feed_item_ids_json,
        @proposal_ids_json, @signal_sources_json,
        @google_doc_url, @escalation_level, @context_score, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
        client_name=excluded.client_name, company=excluded.company, stage=excluded.stage,
        scope=excluded.scope, summary=excluded.summary, build_prompt=excluded.build_prompt,
        next_steps_json=excluded.next_steps_json, flags_json=excluded.flags_json,
        open_questions_json=excluded.open_questions_json, meeting_ids_json=excluded.meeting_ids_json,
        feed_item_ids_json=excluded.feed_item_ids_json,
        proposal_ids_json=excluded.proposal_ids_json, signal_sources_json=excluded.signal_sources_json,
        google_doc_url=excluded.google_doc_url,
        escalation_level=excluded.escalation_level, context_score=excluded.context_score,
        updated_at=excluded.updated_at`
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
      proposal_ids_json: JSON.stringify(engagement.proposalIds ?? []),
      signal_sources_json: JSON.stringify(engagement.signalSources ?? []),
      google_doc_url: engagement.googleDocUrl ?? null,
      escalation_level: engagement.escalationLevel,
      context_score: engagement.contextScore ?? null,
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

  try {
    const { syncEngagementKbLinks } = require('../kb/dealContext') as typeof import('../kb/dealContext')
    syncEngagementKbLinks(engagement.id)
  } catch (err) {
    console.warn('[kb] engagement link sync skipped:', err instanceof Error ? err.message : err)
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
  const normalizedExistingStage = existing ? normalizeEngagementStage(existing.stage) : undefined
  const hasBuildPrompt = Boolean(input.extraction.buildPrompt?.trim())
  let stage: EngagementStage
  if (normalizedExistingStage === 'deploy' || normalizedExistingStage === 'paused') {
    stage = normalizedExistingStage
  } else if (scope === 'unknown') {
    stage = 'intake'
  } else if (normalizedExistingStage === 'build' || normalizedExistingStage === 'test') {
    stage = normalizedExistingStage
  } else if (hasBuildPrompt) {
    const draft: FdeEngagement = {
      ...(existing ?? {
        id: 'draft',
        clientName,
        scope,
        stage: 'context',
        nextSteps: input.extraction.nextSteps,
        flags: input.extraction.flags,
        openQuestions: input.extraction.questions,
        meetingIds: [],
        feedItemIds: [],
        escalationLevel: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }),
      summary: input.extraction.summary,
      buildPrompt: input.extraction.buildPrompt,
      nextSteps: input.extraction.nextSteps,
      flags: input.extraction.flags,
      openQuestions: input.extraction.questions,
      scope
    }
    stage = computeContextScore(draft) >= 60 ? 'build' : 'context'
  } else {
    stage = 'context'
  }

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
    signalSources: [...new Set([...(existing?.signalSources ?? []), 'meeting'])] as FdeEngagement['signalSources'],
    googleDocUrl: input.googleDocUrl ?? existing?.googleDocUrl,
    escalationLevel:
      input.extraction.flags.length > 2 ? 1 : (existing?.escalationLevel ?? 0)
  }, { sessionId: input.sessionId, extraction: input.extraction })
}

function normalizeFeedItemId(feedItemId: string): string {
  return feedItemId.replace(/^ext-/, '')
}

function feedItemAlreadyLinked(engagement: FdeEngagement, feedItemId: string): boolean {
  const normalized = normalizeFeedItemId(feedItemId)
  return engagement.feedItemIds.some((id) => normalizeFeedItemId(id) === normalized)
}

function canonicalFeedItemId(feedItemId: string): string {
  const normalized = normalizeFeedItemId(feedItemId)
  return feedItemId.startsWith('ext-') ? feedItemId : `ext-${normalized}`
}

export function linkFeedItemToEngagement(engagementId: string, feedItemId: string): FdeEngagement | null {
  const existing = getEngagement(engagementId)
  if (!existing) return null
  if (feedItemAlreadyLinked(existing, feedItemId)) return existing

  return upsertEngagement({
    id: existing.id,
    clientName: existing.clientName,
    feedItemIds: [...existing.feedItemIds, canonicalFeedItemId(feedItemId)]
  })
}

export function createEngagementFromFeedItem(input: {
  feedItemId: string
  clientName?: string
  company?: string
}): FdeEngagement {
  const normalized = normalizeFeedItemId(input.feedItemId)
  const linked = listEngagements(500).find((e) => feedItemAlreadyLinked(e, input.feedItemId))
  if (linked) {
    return linkFeedItemToEngagement(linked.id, input.feedItemId)!
  }

  const clientName =
    input.clientName?.trim() || `Inbound · ${normalized.slice(0, 8).toUpperCase()}`

  return upsertEngagement({
    clientName,
    company: input.company?.trim() || undefined,
    stage: 'intake',
    scope: 'unknown',
    feedItemIds: [canonicalFeedItemId(input.feedItemId)]
  })
}
