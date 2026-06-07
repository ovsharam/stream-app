import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { AgentProposal } from '../../shared/agent-proposal'
import type { IntentionEpisode } from '../../shared/intention-episode'
import type { OperatorEvent } from '../../shared/operator-events'
import type { FdeTaskSession } from '../../shared/fde-training'
import type { FdeMeetingCorpusExport } from '../fde/trainingStore'

let client: SupabaseClient | null | undefined

const DEFAULT_OPERATOR_ID = process.env.STREAM_OPERATOR_ID ?? 'local'

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = serverSupabaseSecret()
  return Boolean(url?.trim() && key?.trim())
}

function serverSupabaseSecret(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY
  )?.trim()
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const key = serverSupabaseSecret()

  if (!url || !key) {
    client = null
    return null
  }

  // Node 20 lacks native WebSocket — required by @supabase/realtime-js
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = ws as unknown as typeof WebSocket
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return client
}

export function resetSupabaseClientForTests(): void {
  client = undefined
}

function rowFromOperatorEvent(event: OperatorEvent, createdAt: number) {
  return {
    id: event.id,
    session_id: event.sessionId,
    operator_id: event.operatorId,
    type: event.type,
    ts: event.ts,
    surface: event.surface ?? null,
    subject_type: event.subjectType ?? null,
    subject_id: event.subjectId ?? null,
    correlation_id: event.correlationId ?? null,
    payload: event.payload ?? {},
    created_at: createdAt
  }
}

export async function syncOperatorEventsToSupabase(events: OperatorEvent[]): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || events.length === 0) return 0

  const now = Date.now()
  const rows = events.map((e) => rowFromOperatorEvent(e, now))
  const { error } = await sb.from('operator_events').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export async function syncTrainingSessionsToSupabase(
  sessions: FdeTaskSession[],
  exportedAt: number
): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || sessions.length === 0) return 0

  const rows = sessions.map((s) => ({
    id: s.id,
    operator_id: s.operatorId,
    correlation_id: s.correlationId,
    session_id: s.sessionId,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    signals: s.signals,
    actions: s.actions,
    meetings: s.meetings,
    traces: s.traces,
    exported_at: exportedAt
  }))

  const { error } = await sb.from('fde_training_sessions').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export type FdeMeetingCorpusRow = FdeMeetingCorpusExport

export async function syncMeetingCorpusToSupabase(corpus: FdeMeetingCorpusExport): Promise<void> {
  const sb = getSupabaseAdmin()
  if (!sb) return

  const { error } = await sb.from('fde_meeting_snapshots').upsert(
    {
      session_id: corpus.sessionId,
      operator_id: corpus.operatorId,
      engagement_id: corpus.engagementId ?? null,
      exported_at: corpus.exportedAt,
      meeting: corpus.meeting ?? {},
      chunks: corpus.chunks,
      signals: corpus.signals,
      starred: corpus.starred,
      predictions: corpus.predictions,
      decisions: corpus.decisions,
      revisions: corpus.revisions,
      requirements: corpus.requirements
    },
    { onConflict: 'session_id' }
  )
  if (error) throw error
}

export async function syncTrainingExportToSupabase(): Promise<{
  synced: number
  stats: import('../../shared/fde-training').FdeTrainingDataset['stats']
}> {
  const { buildFdeTrainingDataset } = await import('../training/dataset')
  const dataset = buildFdeTrainingDataset()
  const synced = await syncTrainingSessionsToSupabase(dataset.sessions, dataset.exportedAt)
  return { synced, stats: dataset.stats }
}

export type AgentInteractionLogRow = {
  id: string
  proposalId: string
  stage: string
  payload: Record<string, unknown>
  ts: number
}

function rowFromAgentProposal(proposal: AgentProposal) {
  return {
    id: proposal.id,
    operator_id: DEFAULT_OPERATOR_ID,
    source: proposal.source,
    thread_id: proposal.threadId,
    sender_name: proposal.senderName,
    raw_message: proposal.rawMessage,
    intent: proposal.intent,
    confidence: proposal.confidence,
    linkedin_reply_draft: proposal.linkedinReplyDraft,
    booking_task: proposal.bookingTask ?? null,
    invitee_resolution: proposal.inviteeResolution,
    status: proposal.status,
    created_at: new Date(proposal.createdAt).toISOString(),
    updated_at: new Date(proposal.updatedAt).toISOString(),
    approved_at: proposal.approvedAt != null ? new Date(proposal.approvedAt).toISOString() : null,
    execution_result: proposal.executionLog ?? null
  }
}

function rowFromAgentInteractionLog(entry: AgentInteractionLogRow) {
  return {
    id: entry.id,
    proposal_id: entry.proposalId,
    operator_id: DEFAULT_OPERATOR_ID,
    stage: entry.stage,
    payload: entry.payload ?? {},
    created_at: new Date(entry.ts).toISOString()
  }
}

export async function syncAgentProposalsToSupabase(proposals: AgentProposal[]): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || proposals.length === 0) return 0

  const rows = proposals.map(rowFromAgentProposal)
  const { error } = await sb.from('agent_proposals').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export async function syncAgentInteractionLogToSupabase(entries: AgentInteractionLogRow[]): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || entries.length === 0) return 0

  const rows = entries.map(rowFromAgentInteractionLog)
  const { error } = await sb.from('agent_interaction_log').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

function rowFromIntentionEpisode(episode: IntentionEpisode, syncedAt: number) {
  return {
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
    event_chain: episode.eventChain,
    event_ids: episode.eventIds,
    latencies: episode.latencies,
    commitment_depth: episode.commitmentDepth,
    behavioral_weight: episode.behavioralWeight,
    reaction_tier: episode.reactionTier ?? null,
    text_intention: episode.textIntention ?? null,
    dominant_intention: episode.dominantIntention ?? null,
    created_at: episode.startedAt,
    updated_at: syncedAt
  }
}

export async function syncIntentionEpisodesToSupabase(episodes: IntentionEpisode[]): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || episodes.length === 0) return 0

  const now = Date.now()
  const rows = episodes.map((e) => rowFromIntentionEpisode(e, now))
  const { error } = await sb.from('intention_episodes').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export async function syncAllIntentionEpisodesToSupabase(): Promise<number> {
  const { listAllEpisodes } = await import('../intention/episodeStore')
  const episodes = listAllEpisodes()
  return syncIntentionEpisodesToSupabase(episodes)
}

export async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'not configured' }

  const { error } = await sb.from('operator_events').select('id', { count: 'exact', head: true })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return {
        ok: false,
        error:
          'tables missing — run supabase/migrations/001_operator_capture.sql, 003_fde_meeting_corpus.sql, and 004_intention_episodes.sql'
      }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
