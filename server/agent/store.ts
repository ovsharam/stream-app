import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { proposalDedupeKey } from '../../shared/agent-dedupe'
import type {
  AgentBrief,
  AgentActionProposal,
  AgentInteractionStage,
  AgentProposal,
  AgentProposalStatus,
  AgentThreadMessage,
  BookingTaskPayload,
  InviteeResolution
} from '../../shared/agent-proposal'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_proposals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_profile_url TEXT,
  raw_message TEXT NOT NULL,
  intent TEXT NOT NULL,
  confidence REAL NOT NULL,
  linkedin_reply_draft TEXT NOT NULL,
  booking_task_json TEXT,
  invitee_resolution_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  approved_at INTEGER,
  executed_at INTEGER,
  execution_log_json TEXT,
  dedupe_key TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_status ON agent_proposals(status);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_thread ON agent_proposals(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_proposals_created ON agent_proposals(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_interaction_log (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_log_proposal ON agent_interaction_log(proposal_id);
CREATE INDEX IF NOT EXISTS idx_agent_log_ts ON agent_interaction_log(ts DESC);
`

let db: Database.Database | null = null

function agentDbGlobal(): Database.Database | null {
  return (globalThis as { __streamAgentDb?: Database.Database }).__streamAgentDb ?? null
}

function setAgentDbGlobal(instance: Database.Database): void {
  ;(globalThis as { __streamAgentDb?: Database.Database }).__streamAgentDb = instance
}

function queueAgentProposalSync(proposal: AgentProposal): void {
  void import('../supabase/sync')
    .then(({ syncAgentProposalsToSupabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured()) return
      return syncAgentProposalsToSupabase([proposal])
    })
    .catch((err) => {
      console.warn('[supabase] agent proposal sync failed:', err instanceof Error ? err.message : err)
    })
}

function queueAgentInteractionSync(entry: {
  id: string
  proposalId: string
  stage: AgentInteractionStage
  payload: Record<string, unknown>
  ts: number
}): void {
  void import('../supabase/sync')
    .then(({ syncAgentInteractionLogToSupabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured()) return
      return syncAgentInteractionLogToSupabase([entry])
    })
    .catch((err) => {
      console.warn('[supabase] agent interaction sync failed:', err instanceof Error ? err.message : err)
    })
}

function getDb(): Database.Database {
  const existing = db ?? agentDbGlobal()
  if (existing) {
    db = existing
    return existing
  }
  const dataDir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  const path = join(dataDir, 'agent.sqlite')
  mkdirSync(dirname(path), { recursive: true })
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  migrateAgentDb(db)
  setAgentDbGlobal(db)
  return db
}

function migrateAgentDb(database: Database.Database): void {
  const cols = database.prepare('PRAGMA table_info(agent_proposals)').all() as { name: string }[]
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('brief_json')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN brief_json TEXT')
  }
  if (!names.has('thread_messages_json')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN thread_messages_json TEXT')
  }
  if (!names.has('action_proposals_json')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN action_proposals_json TEXT')
  }
  if (!names.has('dedupe_key')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN dedupe_key TEXT')
  }
  if (!names.has('detected_at')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN detected_at INTEGER')
  }
  if (!names.has('snoozed_until')) {
    database.exec('ALTER TABLE agent_proposals ADD COLUMN snoozed_until INTEGER')
  }
  database.exec('CREATE INDEX IF NOT EXISTS idx_agent_proposals_dedupe ON agent_proposals(dedupe_key)')
  backfillProposalDedupeKeys(database)
  cleanupDuplicatePendingProposals(database)
}

function backfillProposalDedupeKeys(database: Database.Database): void {
  const rows = database
    .prepare(
      `SELECT id, thread_id, sender_name, raw_message, dedupe_key FROM agent_proposals WHERE dedupe_key IS NULL OR dedupe_key = ''`
    )
    .all() as Row[]
  if (rows.length === 0) return

  const update = database.prepare('UPDATE agent_proposals SET dedupe_key = @dedupe_key WHERE id = @id')
  const tx = database.transaction((batch: Row[]) => {
    for (const row of batch) {
      update.run({
        id: String(row.id),
        dedupe_key: proposalDedupeKey({
          threadId: String(row.thread_id),
          senderName: String(row.sender_name),
          rawMessage: String(row.raw_message)
        })
      })
    }
  })
  tx(rows)
}

function cleanupDuplicatePendingProposals(database: Database.Database): void {
  const groups = database
    .prepare(
      `SELECT dedupe_key FROM agent_proposals
       WHERE status = 'pending' AND dedupe_key IS NOT NULL AND dedupe_key != ''
       GROUP BY dedupe_key HAVING COUNT(*) > 1`
    )
    .all() as { dedupe_key: string }[]
  if (groups.length === 0) return

  const listIds = database.prepare(
    `SELECT id FROM agent_proposals
     WHERE dedupe_key = @dedupe_key AND status = 'pending'
     ORDER BY created_at DESC`
  )
  const reject = database.prepare(
    `UPDATE agent_proposals SET status = 'rejected', updated_at = @updated_at WHERE id = @id`
  )
  const now = Date.now()
  const tx = database.transaction((keys: { dedupe_key: string }[]) => {
    for (const { dedupe_key } of keys) {
      const ids = listIds.all({ dedupe_key }) as { id: string }[]
      for (let i = 1; i < ids.length; i += 1) {
        reject.run({ id: ids[i].id, updated_at: now })
      }
    }
  })
  tx(groups)
}

function dedupePendingProposals(proposals: AgentProposal[]): AgentProposal[] {
  const byKey = new Map<string, AgentProposal>()
  for (const proposal of proposals) {
    const key =
      proposal.dedupeKey ??
      proposalDedupeKey({
        threadId: proposal.threadId,
        senderName: proposal.senderName,
        rawMessage: proposal.rawMessage
      })
    const existing = byKey.get(key)
    if (!existing || proposal.createdAt > existing.createdAt) {
      byKey.set(key, proposal)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt)
}

export function initAgentStore(): void {
  getDb()
}

export function wakeExpiredSnoozedProposals(now = Date.now()): number {
  const result = getDb()
    .prepare(
      `UPDATE agent_proposals
       SET snoozed_until = NULL, updated_at = @now
       WHERE status = 'pending' AND snoozed_until IS NOT NULL AND snoozed_until <= @now`
    )
    .run({ now })
  return Number(result.changes ?? 0)
}

type Row = Record<string, unknown>

function rowToProposal(row: Row): AgentProposal {
  return {
    id: String(row.id),
    source: 'linkedin',
    threadId: String(row.thread_id),
    senderName: String(row.sender_name),
    senderProfileUrl: row.sender_profile_url ? String(row.sender_profile_url) : undefined,
    rawMessage: String(row.raw_message),
    intent: String(row.intent) as AgentProposal['intent'],
    confidence: Number(row.confidence),
    linkedinReplyDraft: String(row.linkedin_reply_draft),
    bookingTask: row.booking_task_json
      ? (JSON.parse(String(row.booking_task_json)) as BookingTaskPayload)
      : undefined,
    inviteeResolution: JSON.parse(String(row.invitee_resolution_json)) as InviteeResolution,
    status: String(row.status) as AgentProposalStatus,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    approvedAt: row.approved_at != null ? Number(row.approved_at) : undefined,
    executedAt: row.executed_at != null ? Number(row.executed_at) : undefined,
    executionLog: row.execution_log_json
      ? (JSON.parse(String(row.execution_log_json)) as AgentProposal['executionLog'])
      : undefined,
    brief: row.brief_json ? (JSON.parse(String(row.brief_json)) as AgentBrief) : undefined,
    threadMessages: row.thread_messages_json
      ? (JSON.parse(String(row.thread_messages_json)) as AgentThreadMessage[])
      : undefined,
    actionProposals: row.action_proposals_json
      ? (JSON.parse(String(row.action_proposals_json)) as AgentActionProposal[])
      : undefined,
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : undefined,
    detectedAt: row.detected_at != null ? Number(row.detected_at) : undefined,
    snoozedUntil: row.snoozed_until != null ? Number(row.snoozed_until) : undefined
  }
}

export function insertProposal(proposal: AgentProposal): void {
  const dedupeKey =
    proposal.dedupeKey ??
    proposalDedupeKey({
      threadId: proposal.threadId,
      senderName: proposal.senderName,
      rawMessage: proposal.rawMessage
    })
  proposal.dedupeKey = dedupeKey

  getDb()
    .prepare(
      `INSERT INTO agent_proposals
       (id, source, thread_id, sender_name, sender_profile_url, raw_message, intent, confidence,
        linkedin_reply_draft, booking_task_json, invitee_resolution_json, status,
        created_at, updated_at, approved_at, executed_at, execution_log_json,
        brief_json, thread_messages_json, action_proposals_json, dedupe_key, detected_at, snoozed_until)
       VALUES (@id, @source, @thread_id, @sender_name, @sender_profile_url, @raw_message, @intent, @confidence,
        @linkedin_reply_draft, @booking_task_json, @invitee_resolution_json, @status,
        @created_at, @updated_at, @approved_at, @executed_at, @execution_log_json,
        @brief_json, @thread_messages_json, @action_proposals_json, @dedupe_key, @detected_at, @snoozed_until)`
    )
    .run({
      id: proposal.id,
      source: proposal.source,
      thread_id: proposal.threadId,
      sender_name: proposal.senderName,
      sender_profile_url: proposal.senderProfileUrl ?? null,
      raw_message: proposal.rawMessage,
      intent: proposal.intent,
      confidence: proposal.confidence,
      linkedin_reply_draft: proposal.linkedinReplyDraft,
      booking_task_json: proposal.bookingTask ? JSON.stringify(proposal.bookingTask) : null,
      invitee_resolution_json: JSON.stringify(proposal.inviteeResolution),
      status: proposal.status,
      created_at: proposal.createdAt,
      updated_at: proposal.updatedAt,
      approved_at: proposal.approvedAt ?? null,
      executed_at: proposal.executedAt ?? null,
      execution_log_json: proposal.executionLog ? JSON.stringify(proposal.executionLog) : null,
      brief_json: proposal.brief ? JSON.stringify(proposal.brief) : null,
      thread_messages_json: proposal.threadMessages?.length
        ? JSON.stringify(proposal.threadMessages)
        : null,
      action_proposals_json: proposal.actionProposals?.length
        ? JSON.stringify(proposal.actionProposals)
        : null,
      dedupe_key: dedupeKey,
      detected_at: proposal.detectedAt ?? proposal.createdAt,
      snoozed_until: proposal.snoozedUntil ?? null
    })
  queueAgentProposalSync(proposal)
}

export function updateProposal(proposal: AgentProposal): void {
  getDb()
    .prepare(
      `UPDATE agent_proposals SET
        linkedin_reply_draft = @linkedin_reply_draft,
        booking_task_json = @booking_task_json,
        invitee_resolution_json = @invitee_resolution_json,
        status = @status,
        updated_at = @updated_at,
        approved_at = @approved_at,
        executed_at = @executed_at,
        execution_log_json = @execution_log_json,
        brief_json = @brief_json,
        thread_messages_json = @thread_messages_json,
        action_proposals_json = @action_proposals_json,
        snoozed_until = @snoozed_until
       WHERE id = @id`
    )
    .run({
      id: proposal.id,
      linkedin_reply_draft: proposal.linkedinReplyDraft,
      booking_task_json: proposal.bookingTask ? JSON.stringify(proposal.bookingTask) : null,
      invitee_resolution_json: JSON.stringify(proposal.inviteeResolution),
      status: proposal.status,
      updated_at: proposal.updatedAt,
      approved_at: proposal.approvedAt ?? null,
      executed_at: proposal.executedAt ?? null,
      execution_log_json: proposal.executionLog ? JSON.stringify(proposal.executionLog) : null,
      brief_json: proposal.brief ? JSON.stringify(proposal.brief) : null,
      thread_messages_json: proposal.threadMessages?.length
        ? JSON.stringify(proposal.threadMessages)
        : null,
      action_proposals_json: proposal.actionProposals?.length
        ? JSON.stringify(proposal.actionProposals)
        : null,
      snoozed_until: proposal.snoozedUntil ?? null
    })
  queueAgentProposalSync(proposal)
}

export function getProposal(id: string): AgentProposal | null {
  const row = getDb().prepare('SELECT * FROM agent_proposals WHERE id = ?').get(id) as Row | undefined
  return row ? rowToProposal(row) : null
}

export function listProposals(input: {
  status?: AgentProposalStatus
  limit?: number
} = {}): AgentProposal[] {
  wakeExpiredSnoozedProposals()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const now = Date.now()
  const clauses: string[] = []
  const params: Record<string, unknown> = { limit, now }
  if (input.status) {
    clauses.push('status = @status')
    params.status = input.status
    if (input.status === 'pending') {
      clauses.push('(snoozed_until IS NULL OR snoozed_until <= @now)')
    }
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(`SELECT * FROM agent_proposals ${where} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as Row[]
  const proposals = rows.map(rowToProposal)
  if (input.status === 'pending') {
    return dedupePendingProposals(proposals)
  }
  return proposals
}

export function findProposalByDedupeKey(dedupeKey: string): AgentProposal | null {
  const row = getDb()
    .prepare('SELECT * FROM agent_proposals WHERE dedupe_key = ? ORDER BY created_at DESC LIMIT 1')
    .get(dedupeKey) as Row | undefined
  return row ? rowToProposal(row) : null
}

export function countUniquePendingProposals(): number {
  const now = Date.now()
  wakeExpiredSnoozedProposals(now)
  const row = getDb()
    .prepare(
      `SELECT COUNT(DISTINCT COALESCE(NULLIF(dedupe_key, ''), id)) AS n
       FROM agent_proposals
       WHERE status = 'pending'
         AND (snoozed_until IS NULL OR snoozed_until <= @now)`
    )
    .get({ now }) as { n: number }
  return Number(row?.n ?? 0)
}

export function logInteraction(
  proposalId: string,
  stage: AgentInteractionStage,
  payload: Record<string, unknown>
): void {
  const id = `alog-${randomUUID()}`
  const ts = Date.now()
  getDb()
    .prepare(
      `INSERT INTO agent_interaction_log (id, proposal_id, stage, payload_json, ts)
       VALUES (@id, @proposal_id, @stage, @payload_json, @ts)`
    )
    .run({
      id,
      proposal_id: proposalId,
      stage,
      payload_json: JSON.stringify(payload),
      ts
    })
  queueAgentInteractionSync({ id, proposalId, stage, payload, ts })
}

export function listInteractionLog(proposalId: string): Array<{
  id: string
  stage: AgentInteractionStage
  payload: Record<string, unknown>
  ts: number
}> {
  const rows = getDb()
    .prepare('SELECT * FROM agent_interaction_log WHERE proposal_id = ? ORDER BY ts ASC')
    .all(proposalId) as Row[]
  return rows.map((r) => ({
    id: String(r.id),
    stage: String(r.stage) as AgentInteractionStage,
    payload: JSON.parse(String(r.payload_json)) as Record<string, unknown>,
    ts: Number(r.ts)
  }))
}

export function findRecentProposalByThread(threadId: string, withinMs = 3600_000): AgentProposal | null {
  const since = Date.now() - withinMs
  const row = getDb()
    .prepare(
      `SELECT * FROM agent_proposals WHERE thread_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(threadId, since) as Row | undefined
  return row ? rowToProposal(row) : null
}

export function exportAgentTrainingRecords(limit = 200): Array<{
  proposal: AgentProposal
  log: ReturnType<typeof listInteractionLog>
}> {
  const rows = getDb()
    .prepare('SELECT * FROM agent_proposals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Row[]
  return rows.map((row) => {
    const proposal = rowToProposal(row)
    return { proposal, log: listInteractionLog(proposal.id) }
  })
}

export function countAgentProposals(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM agent_proposals').get() as { n: number }
  return Number(row?.n ?? 0)
}

export function countAgentProposalsByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS n FROM agent_proposals GROUP BY status')
    .all() as { status: string; n: number }[]
  const out: Record<string, number> = {}
  for (const row of rows) out[row.status] = Number(row.n)
  return out
}

export function countAgentInteractionLog(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM agent_interaction_log').get() as { n: number }
  return Number(row?.n ?? 0)
}
