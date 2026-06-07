import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  BuildRunExecutor,
  BuildRunStatus,
  ExtractionRevisionSource,
  FdeAssistInvocation,
  FdeAssistPrediction,
  FdeBuildRun,
  FdeDecisionEvent,
  FdeExtractionRevision,
  FdeFeedbackEvent,
  FdeLifecyclePhase,
  FdeMeetingRecord,
  FdeMeetingSignal,
  FdeRequirement,
  FdeStarredMoment,
  FdeTrainingCorpusStats,
  FdeTranscriptChunk,
  FeedbackSource,
  FeedbackType,
  RequirementField,
  StarMomentReason
} from '../../shared/fde-training'
import type { MeetingExtraction, MeetingSession } from '../cluster/meetingPipeline'
import type { ScopeBucket } from '../../shared/fde-engagement'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fde_meeting_records (
  session_id TEXT PRIMARY KEY,
  engagement_id TEXT,
  title TEXT,
  deal_hint TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_ms INTEGER,
  transcript TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  signal_count INTEGER NOT NULL DEFAULT 0,
  starred_count INTEGER NOT NULL DEFAULT 0,
  prediction_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_meeting_engagement ON fde_meeting_records(engagement_id);

CREATE TABLE IF NOT EXISTS fde_transcript_chunks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  UNIQUE(session_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_fde_chunks_session ON fde_transcript_chunks(session_id);

CREATE TABLE IF NOT EXISTS fde_meeting_signals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  chunk_index INTEGER,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_signals_session ON fde_meeting_signals(session_id);

CREATE TABLE IF NOT EXISTS fde_starred_moments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT NOT NULL,
  prediction_id TEXT,
  reason TEXT,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fde_assist_predictions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  signal_text TEXT NOT NULL,
  say_this TEXT NOT NULL,
  follow_up TEXT,
  flag TEXT,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fde_extraction_revisions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  engagement_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  summary TEXT,
  build_prompt TEXT,
  scope_decision TEXT,
  next_steps_json TEXT NOT NULL,
  flags_json TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  decisions_json TEXT NOT NULL,
  diff_from_prev_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_extraction_engagement ON fde_extraction_revisions(engagement_id);

CREATE TABLE IF NOT EXISTS fde_requirements (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  session_id TEXT,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_requirements_engagement ON fde_requirements(engagement_id);

CREATE TABLE IF NOT EXISTS fde_build_runs (
  id TEXT PRIMARY KEY,
  engagement_id TEXT,
  extraction_id TEXT,
  executor TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL,
  trace_json TEXT,
  deploy_ref TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE TABLE IF NOT EXISTS fde_feedback_events (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  source TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  text TEXT NOT NULL,
  requirement_id TEXT,
  build_run_id TEXT,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fde_decision_events (
  id TEXT PRIMARY KEY,
  engagement_id TEXT,
  session_id TEXT,
  phase TEXT NOT NULL,
  type TEXT NOT NULL,
  input_ref TEXT,
  auto_suggestion TEXT,
  human_action TEXT,
  outcome TEXT,
  metadata_json TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fde_decisions_engagement ON fde_decision_events(engagement_id);

CREATE TABLE IF NOT EXISTS fde_assist_invocations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT,
  session_id TEXT,
  surface TEXT NOT NULL,
  query TEXT NOT NULL,
  prediction_id TEXT,
  suggestion TEXT,
  response TEXT,
  page_context_json TEXT,
  adopted INTEGER,
  ts INTEGER NOT NULL
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

function diffFields(
  prev: Partial<FdeExtractionRevision> | null,
  next: {
    summary?: string
    buildPrompt?: string
    scopeDecision?: string
  }
): Record<string, { before?: string; after?: string }> | undefined {
  if (!prev) return undefined
  const diff: Record<string, { before?: string; after?: string }> = {}
  if (prev.summary !== next.summary && (prev.summary || next.summary)) {
    diff.summary = { before: prev.summary, after: next.summary }
  }
  if (prev.buildPrompt !== next.buildPrompt && (prev.buildPrompt || next.buildPrompt)) {
    diff.buildPrompt = { before: prev.buildPrompt, after: next.buildPrompt }
  }
  if (prev.scopeDecision !== next.scopeDecision && (prev.scopeDecision || next.scopeDecision)) {
    diff.scopeDecision = { before: prev.scopeDecision, after: next.scopeDecision }
  }
  return Object.keys(diff).length ? diff : undefined
}

export function upsertTranscriptChunk(input: {
  sessionId: string
  chunkIndex: number
  text: string
  ts: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO fde_transcript_chunks (id, session_id, chunk_index, text, ts)
       VALUES (@id, @session_id, @chunk_index, @text, @ts)
       ON CONFLICT(session_id, chunk_index) DO UPDATE SET text=excluded.text, ts=excluded.ts`
    )
    .run({
      id: `chunk-${input.sessionId}-${input.chunkIndex}`,
      session_id: input.sessionId,
      chunk_index: input.chunkIndex,
      text: input.text,
      ts: input.ts
    })
}

export function insertMeetingSignal(input: {
  sessionId: string
  type: string
  text: string
  chunkIndex?: number
  ts: number
}): FdeMeetingSignal {
  const row: FdeMeetingSignal = {
    id: `sig-${randomUUID()}`,
    sessionId: input.sessionId,
    type: input.type,
    text: input.text,
    chunkIndex: input.chunkIndex,
    ts: input.ts
  }
  getDb()
    .prepare(
      `INSERT INTO fde_meeting_signals (id, session_id, type, text, chunk_index, ts)
       VALUES (@id, @session_id, @type, @text, @chunk_index, @ts)`
    )
    .run({
      id: row.id,
      session_id: row.sessionId,
      type: row.type,
      text: row.text,
      chunk_index: row.chunkIndex ?? null,
      ts: row.ts
    })
  return row
}

export function insertStarredMoment(input: {
  sessionId: string
  text: string
  predictionId?: string
  reason?: StarMomentReason
  ts: number
}): FdeStarredMoment {
  const row: FdeStarredMoment = {
    id: `star-${randomUUID()}`,
    sessionId: input.sessionId,
    text: input.text,
    predictionId: input.predictionId,
    reason: input.reason,
    ts: input.ts
  }
  getDb()
    .prepare(
      `INSERT INTO fde_starred_moments (id, session_id, text, prediction_id, reason, ts)
       VALUES (@id, @session_id, @text, @prediction_id, @reason, @ts)`
    )
    .run({
      id: row.id,
      session_id: row.sessionId,
      text: row.text,
      prediction_id: row.predictionId ?? null,
      reason: row.reason ?? null,
      ts: row.ts
    })
  return row
}

export function insertAssistPrediction(input: {
  id: string
  sessionId: string
  signalText: string
  sayThis: string
  followUp?: string
  flag?: string
  ts: number
}): FdeAssistPrediction {
  const row: FdeAssistPrediction = { ...input }
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO fde_assist_predictions
       (id, session_id, signal_text, say_this, follow_up, flag, ts)
       VALUES (@id, @session_id, @signal_text, @say_this, @follow_up, @flag, @ts)`
    )
    .run({
      id: row.id,
      session_id: row.sessionId,
      signal_text: row.signalText,
      say_this: row.sayThis,
      follow_up: row.followUp ?? null,
      flag: row.flag ?? null,
      ts: row.ts
    })
  return row
}

export function finalizeMeetingRecord(input: {
  session: MeetingSession
  engagementId?: string
  transcript: string
  durationMs: number
}): FdeMeetingRecord {
  const now = Date.now()
  const record: FdeMeetingRecord = {
    sessionId: input.session.id,
    engagementId: input.engagementId,
    title: input.session.title,
    dealHint: input.session.dealHint,
    startedAt: input.session.startedAt,
    endedAt: input.session.endedAt ?? now,
    durationMs: input.durationMs,
    transcript: input.transcript,
    chunkCount: input.session.chunks.length,
    signalCount: input.session.signals.length,
    starredCount: input.session.starred.length,
    predictionCount: input.session.predictions.length,
    createdAt: now
  }
  getDb()
    .prepare(
      `INSERT INTO fde_meeting_records
       (session_id, engagement_id, title, deal_hint, started_at, ended_at, duration_ms, transcript,
        chunk_count, signal_count, starred_count, prediction_count, created_at)
       VALUES (@session_id, @engagement_id, @title, @deal_hint, @started_at, @ended_at, @duration_ms,
        @transcript, @chunk_count, @signal_count, @starred_count, @prediction_count, @created_at)
       ON CONFLICT(session_id) DO UPDATE SET
        engagement_id=excluded.engagement_id, ended_at=excluded.ended_at, duration_ms=excluded.duration_ms,
        transcript=excluded.transcript, chunk_count=excluded.chunk_count, signal_count=excluded.signal_count,
        starred_count=excluded.starred_count, prediction_count=excluded.prediction_count`
    )
    .run({
      session_id: record.sessionId,
      engagement_id: record.engagementId ?? null,
      title: record.title ?? null,
      deal_hint: record.dealHint ?? null,
      started_at: record.startedAt,
      ended_at: record.endedAt ?? null,
      duration_ms: record.durationMs ?? null,
      transcript: record.transcript ?? null,
      chunk_count: record.chunkCount,
      signal_count: record.signalCount,
      starred_count: record.starredCount,
      prediction_count: record.predictionCount,
      created_at: record.createdAt
    })
  return record
}

export function linkMeetingToEngagement(sessionId: string, engagementId: string): void {
  getDb()
    .prepare(`UPDATE fde_meeting_records SET engagement_id = ? WHERE session_id = ?`)
    .run(engagementId, sessionId)
}

function latestExtractionRevision(engagementId: string): FdeExtractionRevision | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM fde_extraction_revisions WHERE engagement_id = ? ORDER BY version DESC LIMIT 1`
    )
    .get(engagementId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: String(row.id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    engagementId: String(row.engagement_id),
    version: Number(row.version),
    source: String(row.source) as ExtractionRevisionSource,
    summary: row.summary ? String(row.summary) : undefined,
    buildPrompt: row.build_prompt ? String(row.build_prompt) : undefined,
    scopeDecision: row.scope_decision ? String(row.scope_decision) : undefined,
    nextSteps: JSON.parse(String(row.next_steps_json)) as string[],
    flags: JSON.parse(String(row.flags_json)) as string[],
    questions: JSON.parse(String(row.questions_json)) as string[],
    decisions: JSON.parse(String(row.decisions_json)) as string[],
    diffFromPrev: row.diff_from_prev_json
      ? (JSON.parse(String(row.diff_from_prev_json)) as Record<string, { before?: string; after?: string }>)
      : undefined,
    createdAt: Number(row.created_at)
  }
}

export function insertExtractionRevision(input: {
  sessionId?: string
  engagementId: string
  source: ExtractionRevisionSource
  extraction: MeetingExtraction
}): FdeExtractionRevision {
  const prev = latestExtractionRevision(input.engagementId)
  const version = (prev?.version ?? 0) + 1
  const diff = diffFields(prev, {
    summary: input.extraction.summary,
    buildPrompt: input.extraction.buildPrompt,
    scopeDecision: input.extraction.scopeDecision
  })
  const row: FdeExtractionRevision = {
    id: `ext-${randomUUID()}`,
    sessionId: input.sessionId,
    engagementId: input.engagementId,
    version,
    source: input.source,
    summary: input.extraction.summary,
    buildPrompt: input.extraction.buildPrompt,
    scopeDecision: input.extraction.scopeDecision,
    nextSteps: input.extraction.nextSteps,
    flags: input.extraction.flags,
    questions: input.extraction.questions,
    decisions: input.extraction.decisions,
    diffFromPrev: diff,
    createdAt: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO fde_extraction_revisions
       (id, session_id, engagement_id, version, source, summary, build_prompt, scope_decision,
        next_steps_json, flags_json, questions_json, decisions_json, diff_from_prev_json, created_at)
       VALUES (@id, @session_id, @engagement_id, @version, @source, @summary, @build_prompt,
        @scope_decision, @next_steps_json, @flags_json, @questions_json, @decisions_json,
        @diff_from_prev_json, @created_at)`
    )
    .run({
      id: row.id,
      session_id: row.sessionId ?? null,
      engagement_id: row.engagementId,
      version: row.version,
      source: row.source,
      summary: row.summary ?? null,
      build_prompt: row.buildPrompt ?? null,
      scope_decision: row.scopeDecision ?? null,
      next_steps_json: JSON.stringify(row.nextSteps),
      flags_json: JSON.stringify(row.flags),
      questions_json: JSON.stringify(row.questions),
      decisions_json: JSON.stringify(row.decisions),
      diff_from_prev_json: diff ? JSON.stringify(diff) : null,
      created_at: row.createdAt
    })
  seedRequirementsFromExtraction(input.engagementId, input.sessionId, input.extraction, input.source)
  return row
}

function insertRequirement(input: {
  engagementId: string
  sessionId?: string
  field: RequirementField
  value: string
  source: ExtractionRevisionSource | 'feedback'
}): void {
  const now = Date.now()
  const trimmed = input.value.trim()
  if (!trimmed) return
  const existing = getDb()
    .prepare(
      `SELECT id FROM fde_requirements
       WHERE engagement_id = ? AND field = ? AND value = ? LIMIT 1`
    )
    .get(input.engagementId, input.field, trimmed) as { id: string } | undefined
  if (existing) return

  getDb()
    .prepare(
      `INSERT INTO fde_requirements
       (id, engagement_id, session_id, field, value, status, source, created_at, updated_at)
       VALUES (@id, @engagement_id, @session_id, @field, @value, 'open', @source, @created_at, @updated_at)`
    )
    .run({
      id: `req-${randomUUID()}`,
      engagement_id: input.engagementId,
      session_id: input.sessionId ?? null,
      field: input.field,
      value: trimmed,
      source: input.source,
      created_at: now,
      updated_at: now
    })
}

export function seedRequirementsFromExtraction(
  engagementId: string,
  sessionId: string | undefined,
  extraction: MeetingExtraction,
  source: ExtractionRevisionSource
): void {
  if (extraction.summary?.trim()) {
    insertRequirement({
      engagementId,
      sessionId,
      field: 'goal',
      value: extraction.summary.trim(),
      source
    })
  }
  if (extraction.buildPrompt?.trim() && !/^\(no /i.test(extraction.buildPrompt)) {
    insertRequirement({
      engagementId,
      sessionId,
      field: 'build_prompt',
      value: extraction.buildPrompt.trim(),
      source
    })
  }
  insertRequirement({
    engagementId,
    sessionId,
    field: 'constraint',
    value: `scope:${extraction.scopeDecision}`,
    source
  })
  for (const flag of extraction.flags) {
    insertRequirement({ engagementId, sessionId, field: 'risk', value: flag, source })
  }
  for (const q of extraction.questions) {
    insertRequirement({ engagementId, sessionId, field: 'open_question', value: q, source })
  }
  for (const d of extraction.decisions) {
    insertRequirement({ engagementId, sessionId, field: 'decision', value: d, source })
  }
  for (const step of extraction.nextSteps) {
    insertRequirement({ engagementId, sessionId, field: 'next_step', value: step, source })
  }
}

export function insertDecisionEvent(input: {
  engagementId?: string
  sessionId?: string
  phase: FdeLifecyclePhase
  type: string
  inputRef?: string
  autoSuggestion?: string
  humanAction?: string
  outcome?: string
  metadata?: Record<string, unknown>
}): FdeDecisionEvent {
  const row: FdeDecisionEvent = {
    id: `dec-${randomUUID()}`,
    engagementId: input.engagementId,
    sessionId: input.sessionId,
    phase: input.phase,
    type: input.type,
    inputRef: input.inputRef,
    autoSuggestion: input.autoSuggestion,
    humanAction: input.humanAction,
    outcome: input.outcome,
    metadata: input.metadata,
    ts: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO fde_decision_events
       (id, engagement_id, session_id, phase, type, input_ref, auto_suggestion, human_action,
        outcome, metadata_json, ts)
       VALUES (@id, @engagement_id, @session_id, @phase, @type, @input_ref, @auto_suggestion,
        @human_action, @outcome, @metadata_json, @ts)`
    )
    .run({
      id: row.id,
      engagement_id: row.engagementId ?? null,
      session_id: row.sessionId ?? null,
      phase: row.phase,
      type: row.type,
      input_ref: row.inputRef ?? null,
      auto_suggestion: row.autoSuggestion ?? null,
      human_action: row.humanAction ?? null,
      outcome: row.outcome ?? null,
      metadata_json: row.metadata ? JSON.stringify(row.metadata) : null,
      ts: row.ts
    })
  return row
}

export function insertAssistInvocation(input: {
  engagementId?: string
  sessionId?: string
  surface: FdeAssistInvocation['surface']
  query: string
  predictionId?: string
  suggestion?: string
  response?: string
  pageContext?: FdeAssistInvocation['pageContext']
  adopted?: boolean
}): FdeAssistInvocation {
  const row: FdeAssistInvocation = {
    id: `assist-${randomUUID()}`,
    engagementId: input.engagementId,
    sessionId: input.sessionId,
    surface: input.surface,
    query: input.query,
    predictionId: input.predictionId,
    suggestion: input.suggestion,
    response: input.response,
    pageContext: input.pageContext,
    adopted: input.adopted,
    ts: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO fde_assist_invocations
       (id, engagement_id, session_id, surface, query, prediction_id, suggestion, response,
        page_context_json, adopted, ts)
       VALUES (@id, @engagement_id, @session_id, @surface, @query, @prediction_id, @suggestion,
        @response, @page_context_json, @adopted, @ts)`
    )
    .run({
      id: row.id,
      engagement_id: row.engagementId ?? null,
      session_id: row.sessionId ?? null,
      surface: row.surface,
      query: row.query,
      prediction_id: row.predictionId ?? null,
      suggestion: row.suggestion ?? null,
      response: row.response ?? null,
      page_context_json: row.pageContext ? JSON.stringify(row.pageContext) : null,
      adopted: row.adopted === undefined ? null : row.adopted ? 1 : 0,
      ts: row.ts
    })
  return row
}

export function insertBuildRun(input: {
  engagementId?: string
  extractionId?: string
  executor: BuildRunExecutor
  prompt: string
  status: BuildRunStatus
  trace?: Record<string, unknown>
  deployRef?: string
  error?: string
  startedAt: number
  endedAt?: number
}): FdeBuildRun {
  const row: FdeBuildRun = {
    id: `build-${randomUUID()}`,
    engagementId: input.engagementId,
    extractionId: input.extractionId,
    executor: input.executor,
    prompt: input.prompt,
    status: input.status,
    trace: input.trace,
    deployRef: input.deployRef,
    error: input.error,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO fde_build_runs
       (id, engagement_id, extraction_id, executor, prompt, status, trace_json, deploy_ref, error,
        started_at, ended_at)
       VALUES (@id, @engagement_id, @extraction_id, @executor, @prompt, @status, @trace_json,
        @deploy_ref, @error, @started_at, @ended_at)`
    )
    .run({
      id: row.id,
      engagement_id: row.engagementId ?? null,
      extraction_id: row.extractionId ?? null,
      executor: row.executor,
      prompt: row.prompt,
      status: row.status,
      trace_json: row.trace ? JSON.stringify(row.trace) : null,
      deploy_ref: row.deployRef ?? null,
      error: row.error ?? null,
      started_at: row.startedAt,
      ended_at: row.endedAt ?? null
    })
  return row
}

export function insertFeedbackEvent(input: {
  engagementId: string
  source: FeedbackSource
  feedbackType: FeedbackType
  text: string
  requirementId?: string
  buildRunId?: string
}): FdeFeedbackEvent {
  const row: FdeFeedbackEvent = {
    id: `fb-${randomUUID()}`,
    engagementId: input.engagementId,
    source: input.source,
    feedbackType: input.feedbackType,
    text: input.text,
    requirementId: input.requirementId,
    buildRunId: input.buildRunId,
    ts: Date.now()
  }
  getDb()
    .prepare(
      `INSERT INTO fde_feedback_events
       (id, engagement_id, source, feedback_type, text, requirement_id, build_run_id, ts)
       VALUES (@id, @engagement_id, @source, @feedback_type, @text, @requirement_id, @build_run_id, @ts)`
    )
    .run({
      id: row.id,
      engagement_id: row.engagementId,
      source: row.source,
      feedback_type: row.feedbackType,
      text: row.text,
      requirement_id: row.requirementId ?? null,
      build_run_id: row.buildRunId ?? null,
      ts: row.ts
    })
  return row
}

export function engagementIdForSession(sessionId: string): string | undefined {
  const row = getDb()
    .prepare(`SELECT engagement_id FROM fde_meeting_records WHERE session_id = ?`)
    .get(sessionId) as { engagement_id: string | null } | undefined
  if (row?.engagement_id) return row.engagement_id
  const { listEngagements } = require('./engagementStore') as typeof import('./engagementStore')
  const match = listEngagements(500).find((e) => e.meetingIds.includes(sessionId))
  return match?.id
}

export function engagementIdForFeedItem(feedItemId: string): string | undefined {
  const { listEngagements } = require('./engagementStore') as typeof import('./engagementStore')
  const normalized = feedItemId.replace(/^ext-/, '')
  const match = listEngagements(500).find(
    (e) =>
      e.feedItemIds.includes(feedItemId) ||
      e.feedItemIds.includes(`ext-${normalized}`) ||
      e.feedItemIds.some((id) => id.replace(/^ext-/, '') === normalized)
  )
  return match?.id
}

export function getTrainingSummary(): FdeTrainingCorpusStats {
  const count = (table: string) =>
    (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  return {
    meetingRecords: count('fde_meeting_records'),
    transcriptChunks: count('fde_transcript_chunks'),
    signals: count('fde_meeting_signals'),
    starredMoments: count('fde_starred_moments'),
    predictions: count('fde_assist_predictions'),
    extractionRevisions: count('fde_extraction_revisions'),
    requirements: count('fde_requirements'),
    buildRuns: count('fde_build_runs'),
    feedbackEvents: count('fde_feedback_events'),
    decisionEvents: count('fde_decision_events'),
    assistInvocations: count('fde_assist_invocations')
  }
}

export function listAllRequirements(limit = 500): FdeRequirement[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_requirements ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    engagementId: String(r.engagement_id),
    sessionId: r.session_id ? String(r.session_id) : undefined,
    field: String(r.field) as FdeRequirement['field'],
    value: String(r.value),
    status: String(r.status) as FdeRequirement['status'],
    source: String(r.source) as FdeRequirement['source'],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }))
}

export function listDecisionEvents(engagementId: string, limit = 50): FdeDecisionEvent[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM fde_decision_events WHERE engagement_id = ? ORDER BY ts DESC LIMIT ?`
    )
    .all(engagementId, limit) as Record<string, unknown>[]
  return rows.map(mapDecisionRow)
}

export function listDecisionEventsForSession(
  sessionId: string,
  engagementId?: string,
  limit = 200
): FdeDecisionEvent[] {
  const rows = engagementId
    ? (getDb()
        .prepare(
          `SELECT * FROM fde_decision_events
           WHERE session_id = ? OR engagement_id = ?
           ORDER BY ts ASC LIMIT ?`
        )
        .all(sessionId, engagementId, limit) as Record<string, unknown>[])
    : (getDb()
        .prepare(
          `SELECT * FROM fde_decision_events WHERE session_id = ? ORDER BY ts ASC LIMIT ?`
        )
        .all(sessionId, limit) as Record<string, unknown>[])
  return rows.map(mapDecisionRow)
}

function mapDecisionRow(r: Record<string, unknown>): FdeDecisionEvent {
  return {
    id: String(r.id),
    engagementId: r.engagement_id ? String(r.engagement_id) : undefined,
    sessionId: r.session_id ? String(r.session_id) : undefined,
    phase: String(r.phase) as FdeLifecyclePhase,
    type: String(r.type),
    inputRef: r.input_ref ? String(r.input_ref) : undefined,
    autoSuggestion: r.auto_suggestion ? String(r.auto_suggestion) : undefined,
    humanAction: r.human_action ? String(r.human_action) : undefined,
    outcome: r.outcome ? String(r.outcome) : undefined,
    metadata: r.metadata_json
      ? (JSON.parse(String(r.metadata_json)) as Record<string, unknown>)
      : undefined,
    ts: Number(r.ts)
  }
}

export function getMeetingRecord(sessionId: string): FdeMeetingRecord | null {
  const row = getDb()
    .prepare(`SELECT * FROM fde_meeting_records WHERE session_id = ?`)
    .get(sessionId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    sessionId: String(row.session_id),
    engagementId: row.engagement_id ? String(row.engagement_id) : undefined,
    title: row.title ? String(row.title) : undefined,
    dealHint: row.deal_hint ? String(row.deal_hint) : undefined,
    startedAt: Number(row.started_at),
    endedAt: row.ended_at != null ? Number(row.ended_at) : undefined,
    durationMs: row.duration_ms != null ? Number(row.duration_ms) : undefined,
    transcript: row.transcript ? String(row.transcript) : undefined,
    chunkCount: Number(row.chunk_count ?? 0),
    signalCount: Number(row.signal_count ?? 0),
    starredCount: Number(row.starred_count ?? 0),
    predictionCount: Number(row.prediction_count ?? 0),
    createdAt: Number(row.created_at)
  }
}

export function listTranscriptChunksForSession(sessionId: string): FdeTranscriptChunk[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM fde_transcript_chunks WHERE session_id = ? ORDER BY chunk_index ASC`
    )
    .all(sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    chunkIndex: Number(r.chunk_index),
    text: String(r.text),
    ts: Number(r.ts)
  }))
}

export function listMeetingSignalsForSession(sessionId: string): FdeMeetingSignal[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_meeting_signals WHERE session_id = ? ORDER BY ts ASC`)
    .all(sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    type: String(r.type),
    text: String(r.text),
    chunkIndex: r.chunk_index != null ? Number(r.chunk_index) : undefined,
    ts: Number(r.ts)
  }))
}

export function listStarredMomentsForSession(sessionId: string): FdeStarredMoment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_starred_moments WHERE session_id = ? ORDER BY ts ASC`)
    .all(sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    text: String(r.text),
    predictionId: r.prediction_id ? String(r.prediction_id) : undefined,
    reason: r.reason ? (String(r.reason) as StarMomentReason) : undefined,
    ts: Number(r.ts)
  }))
}

export function listAssistPredictionsForSession(sessionId: string): FdeAssistPrediction[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_assist_predictions WHERE session_id = ? ORDER BY ts ASC`)
    .all(sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    signalText: String(r.signal_text),
    sayThis: String(r.say_this),
    followUp: r.follow_up ? String(r.follow_up) : undefined,
    flag: r.flag ? String(r.flag) : undefined,
    ts: Number(r.ts)
  }))
}

export function listExtractionRevisionsForSession(
  sessionId: string,
  engagementId?: string
): FdeExtractionRevision[] {
  const rows = engagementId
    ? (getDb()
        .prepare(
          `SELECT * FROM fde_extraction_revisions
           WHERE session_id = ? OR engagement_id = ?
           ORDER BY version ASC`
        )
        .all(sessionId, engagementId) as Record<string, unknown>[])
    : (getDb()
        .prepare(
          `SELECT * FROM fde_extraction_revisions WHERE session_id = ? ORDER BY version ASC`
        )
        .all(sessionId) as Record<string, unknown>[])
  return rows.map(mapExtractionRevisionRow)
}

function mapExtractionRevisionRow(row: Record<string, unknown>): FdeExtractionRevision {
  return {
    id: String(row.id),
    sessionId: row.session_id ? String(row.session_id) : undefined,
    engagementId: String(row.engagement_id),
    version: Number(row.version),
    source: String(row.source) as ExtractionRevisionSource,
    summary: row.summary ? String(row.summary) : undefined,
    buildPrompt: row.build_prompt ? String(row.build_prompt) : undefined,
    scopeDecision: row.scope_decision ? String(row.scope_decision) : undefined,
    nextSteps: JSON.parse(String(row.next_steps_json ?? '[]')) as string[],
    flags: JSON.parse(String(row.flags_json ?? '[]')) as string[],
    questions: JSON.parse(String(row.questions_json ?? '[]')) as string[],
    decisions: JSON.parse(String(row.decisions_json ?? '[]')) as string[],
    diffFromPrev: row.diff_from_prev_json
      ? (JSON.parse(String(row.diff_from_prev_json)) as Record<
          string,
          { before?: string; after?: string }
        >)
      : undefined,
    createdAt: Number(row.created_at)
  }
}

export function listRequirementsForSession(sessionId: string): FdeRequirement[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM fde_requirements WHERE session_id = ? ORDER BY updated_at ASC`
    )
    .all(sessionId) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    engagementId: String(r.engagement_id),
    sessionId: r.session_id ? String(r.session_id) : undefined,
    field: String(r.field) as RequirementField,
    value: String(r.value),
    status: String(r.status) as FdeRequirement['status'],
    source: String(r.source) as FdeRequirement['source'],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at)
  }))
}

export type FdeMeetingCorpusExport = {
  sessionId: string
  operatorId: string
  engagementId?: string
  exportedAt: number
  meeting: FdeMeetingRecord | null
  chunks: FdeTranscriptChunk[]
  signals: FdeMeetingSignal[]
  starred: FdeStarredMoment[]
  predictions: FdeAssistPrediction[]
  decisions: FdeDecisionEvent[]
  revisions: FdeExtractionRevision[]
  requirements: FdeRequirement[]
}

const DEFAULT_OPERATOR_ID = process.env.STREAM_OPERATOR_ID ?? 'local'

/** Full meeting corpus for cloud export — call after post-call capture completes. */
export function exportMeetingCorpus(
  sessionId: string,
  engagementId?: string
): FdeMeetingCorpusExport {
  const resolvedEngagement = engagementId ?? engagementIdForSession(sessionId)
  return {
    sessionId,
    operatorId: DEFAULT_OPERATOR_ID,
    engagementId: resolvedEngagement,
    exportedAt: Date.now(),
    meeting: getMeetingRecord(sessionId),
    chunks: listTranscriptChunksForSession(sessionId),
    signals: listMeetingSignalsForSession(sessionId),
    starred: listStarredMomentsForSession(sessionId),
    predictions: listAssistPredictionsForSession(sessionId),
    decisions: listDecisionEventsForSession(sessionId, resolvedEngagement),
    revisions: listExtractionRevisionsForSession(sessionId, resolvedEngagement),
    requirements: listRequirementsForSession(sessionId)
  }
}

export function logEngagementStageChange(input: {
  engagementId: string
  fromStage: string
  toStage: string
  scope?: ScopeBucket
}): void {
  insertDecisionEvent({
    engagementId: input.engagementId,
    phase: input.toStage === 'maintenance' ? 'maintenance' : input.toStage === 'build' ? 'build' : 'post_call',
    type: 'stage_change',
    humanAction: `${input.fromStage} → ${input.toStage}`,
    metadata: input.scope ? { scope: input.scope } : undefined
  })
}

export function logEngagementEscalation(input: {
  engagementId: string
  level: number
}): void {
  insertDecisionEvent({
    engagementId: input.engagementId,
    phase: 'discovery',
    type: 'escalation',
    humanAction: `escalation_level=${input.level}`,
    outcome: input.level >= 2 ? 'escalated' : input.level === 1 ? 'needs_attention' : 'normal'
  })
}

export function listRecentStarredMoments(limit = 30): FdeStarredMoment[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_starred_moments ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    text: String(r.text),
    predictionId: r.prediction_id ? String(r.prediction_id) : undefined,
    reason: r.reason ? (String(r.reason) as StarMomentReason) : undefined,
    ts: Number(r.ts)
  }))
}

export function listRecentMeetingSignals(limit = 30): FdeMeetingSignal[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_meeting_signals ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    type: String(r.type),
    text: String(r.text),
    chunkIndex: r.chunk_index != null ? Number(r.chunk_index) : undefined,
    ts: Number(r.ts)
  }))
}

export function listRecentAssistPredictions(limit = 20): FdeAssistPrediction[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_assist_predictions ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    signalText: String(r.signal_text),
    sayThis: String(r.say_this),
    followUp: r.follow_up ? String(r.follow_up) : undefined,
    flag: r.flag ? String(r.flag) : undefined,
    ts: Number(r.ts)
  }))
}

export function listRecentMeetingRecords(limit = 12): FdeMeetingRecord[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_meeting_records ORDER BY started_at DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map((r) => ({
    sessionId: String(r.session_id),
    engagementId: r.engagement_id ? String(r.engagement_id) : undefined,
    title: r.title ? String(r.title) : undefined,
    dealHint: r.deal_hint ? String(r.deal_hint) : undefined,
    startedAt: Number(r.started_at),
    endedAt: r.ended_at != null ? Number(r.ended_at) : undefined,
    durationMs: r.duration_ms != null ? Number(r.duration_ms) : undefined,
    transcript: r.transcript ? String(r.transcript) : undefined,
    chunkCount: Number(r.chunk_count ?? 0),
    signalCount: Number(r.signal_count ?? 0),
    starredCount: Number(r.starred_count ?? 0),
    predictionCount: Number(r.prediction_count ?? 0),
    createdAt: Number(r.created_at)
  }))
}

export function listRecentDecisionEvents(limit = 40): FdeDecisionEvent[] {
  const rows = getDb()
    .prepare(`SELECT * FROM fde_decision_events ORDER BY ts DESC LIMIT ?`)
    .all(limit) as Record<string, unknown>[]
  return rows.map(mapDecisionRow)
}
