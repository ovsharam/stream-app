import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
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
  execution_log_json TEXT
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
}

export function initAgentStore(): void {
  getDb()
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
      : undefined
  }
}

export function insertProposal(proposal: AgentProposal): void {
  getDb()
    .prepare(
      `INSERT INTO agent_proposals
       (id, source, thread_id, sender_name, sender_profile_url, raw_message, intent, confidence,
        linkedin_reply_draft, booking_task_json, invitee_resolution_json, status,
        created_at, updated_at, approved_at, executed_at, execution_log_json,
        brief_json, thread_messages_json, action_proposals_json)
       VALUES (@id, @source, @thread_id, @sender_name, @sender_profile_url, @raw_message, @intent, @confidence,
        @linkedin_reply_draft, @booking_task_json, @invitee_resolution_json, @status,
        @created_at, @updated_at, @approved_at, @executed_at, @execution_log_json,
        @brief_json, @thread_messages_json, @action_proposals_json)`
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
        : null
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
        action_proposals_json = @action_proposals_json
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
        : null
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
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200)
  const clauses: string[] = []
  const params: Record<string, unknown> = { limit }
  if (input.status) {
    clauses.push('status = @status')
    params.status = input.status
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(`SELECT * FROM agent_proposals ${where} ORDER BY created_at DESC LIMIT @limit`)
    .all(params) as Row[]
  return rows.map(rowToProposal)
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
