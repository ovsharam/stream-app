import type {
  DashboardAgentSummary,
  DashboardDecisionSummary,
  DashboardEngagementSummary,
  DashboardInsights,
  DashboardIntentionMix,
  DashboardSourceCount,
  DashboardTaskSessionSummary
} from '../../shared/dashboard'
import type { FdeTaskSession } from '../../shared/fde-training'
import { listProposals, countAgentInteractionLog, countAgentProposals, countAgentProposalsByStatus } from '../agent/store'
import { listEngagements, countEngagements } from '../fde/engagementStore'
import { listRecentDecisionEvents } from '../fde/trainingStore'
import { listTraces } from '../kb/store'
import { blendIntention } from '../kb/intention'
import { buildFdeTrainingDataset } from '../training/dataset'

function countStreamItemsBySource(): DashboardSourceCount[] {
  try {
    const mod = require('../db-sqlite') as typeof import('../db-sqlite')
    return mod.countStreamItemsBySource()
  } catch {
    return []
  }
}

/** Intention mix from compose action traces only — reflects operator intent behind actions. */
function computeIntentionMix(): DashboardIntentionMix {
  const traces = listTraces(50)
  if (traces.length === 0) {
    return {
      explore: 0,
      plan: 0,
      execute: 0,
      reflect: 0,
      defer: 0,
      dominant: null,
      sampleSize: 0
    }
  }
  let mix = traces[0]!.intention
  for (let i = 1; i < traces.length; i++) {
    mix = blendIntention(mix, traces[i]!.intention, 0.12)
  }
  return {
    explore: mix.explore,
    plan: mix.plan,
    execute: mix.execute,
    reflect: mix.reflect,
    defer: mix.defer,
    dominant: mix.dominant,
    sampleSize: traces.length
  }
}

function supabaseConfigured(): boolean {
  try {
    const { isSupabaseConfigured } = require('../supabase/sync') as typeof import('../supabase/sync')
    return isSupabaseConfigured()
  } catch {
    return false
  }
}

function isMeaningfulTaskSession(session: FdeTaskSession): boolean {
  if (session.signals.length > 0) return true
  return session.actions.some(
    (a) =>
      a.type === 'compose_submit' ||
      a.type === 'feed_context_select' ||
      a.type === 'feed_vote' ||
      a.type === 'trace'
  )
}

export function buildDashboardInsights(): DashboardInsights {
  const agentsByStatus = countAgentProposalsByStatus()
  const recentAgents: DashboardAgentSummary[] = listProposals({ limit: 12 }).map((p) => ({
    id: p.id,
    source: p.source,
    senderName: p.senderName,
    intent: p.intent,
    status: p.status,
    confidence: p.confidence,
    ts: p.createdAt
  }))

  const traces = listTraces(20).map((t) => ({
    id: t.id,
    provider: t.provider,
    actionKind: t.actionKind,
    outcome: t.outcome,
    timeToActionMs: t.timeToActionMs,
    dominantIntention: t.intention.dominant,
    ts: t.completedAt,
    rawCommand: t.rawCommand?.slice(0, 100)
  }))

  const engagements: DashboardEngagementSummary[] = listEngagements(12).map((e) => ({
    id: e.id,
    clientName: e.clientName,
    company: e.company,
    stage: e.stage,
    scope: e.scope,
    escalationLevel: e.escalationLevel,
    meetingCount: e.meetingIds.length,
    feedItemCount: e.feedItemIds.length,
    updatedAt: e.updatedAt
  }))

  const dataset = buildFdeTrainingDataset()
  const meaningfulSessions = dataset.sessions.filter(isMeaningfulTaskSession)
  const taskSessions: DashboardTaskSessionSummary[] = [...meaningfulSessions]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, 15)
    .map((s) => ({
      id: s.id,
      correlationId: s.correlationId,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      signalCount: s.signals.length,
      actionCount: s.actions.length,
      traceCount: s.traces.length,
      durationMs: Math.max(0, s.endedAt - s.startedAt)
    }))

  const decisions: DashboardDecisionSummary[] = listRecentDecisionEvents(15).map((d) => ({
    id: d.id,
    type: d.type,
    phase: d.phase,
    ts: d.ts,
    detail: d.humanAction ?? d.autoSuggestion
  }))

  return {
    agents: {
      total: countAgentProposals(),
      interactionLog: countAgentInteractionLog(),
      byStatus: agentsByStatus,
      recent: recentAgents
    },
    traces,
    engagements,
    streamBySource: countStreamItemsBySource(),
    intentionMix: computeIntentionMix(),
    taskSessions,
    decisions,
    trainingSessions: meaningfulSessions.length,
    supabaseConfigured: supabaseConfigured()
  }
}

/** Used by aggregate for engagement count — avoids list cap. */
export function engagementCount(): number {
  return countEngagements()
}
