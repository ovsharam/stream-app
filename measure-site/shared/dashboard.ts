import type { FdeTrainingCorpusStats } from './fde-training'
import type { IntentionEpisode, IntentionEpisodeStats } from './intention-episode'

export function emptyIntentionStats(): IntentionEpisodeStats {
  return {
    total: 0,
    open: 0,
    closed: 0,
    committed: 0,
    engaged: 0,
    abandoned: 0,
    ignored: 0,
    avgBehavioralWeight: 0,
    avgReactionMs: 0,
    statsSampleSize: 0,
    topChains: [],
    reactionBySource: []
  }
}

export function emptyIntentionBlock(): DataDashboardSnapshot['intention'] {
  return { episodes: [], stats: emptyIntentionStats() }
}

/** Guard against older API responses missing the intention block. */
export function normalizeDashboardSnapshot(data: DataDashboardSnapshot): DataDashboardSnapshot {
  return {
    ...data,
    intention: data.intention ?? emptyIntentionBlock(),
    insights: data.insights ?? emptyInsights()
  }
}

export type DashboardActivityKind =
  | 'operator_event'
  | 'starred_moment'
  | 'meeting_signal'
  | 'meeting_ended'
  | 'assist_prediction'
  | 'decision_event'
  | 'kb_datapoint'
  | 'kb_trace'
  | 'stream_item'
  | 'intention_episode'

export interface DashboardActivity {
  id: string
  kind: DashboardActivityKind
  ts: number
  title: string
  detail?: string
  meta?: Record<string, unknown>
}

export interface DashboardMomentStarred {
  id: string
  sessionId: string
  text: string
  reason?: string
  meetingTitle?: string
  ts: number
}

export interface DashboardMomentSignal {
  id: string
  sessionId: string
  type: string
  text: string
  meetingTitle?: string
  ts: number
}

export interface DashboardMomentPrediction {
  id: string
  sessionId: string
  signalText: string
  sayThis: string
  flag?: string
  ts: number
}

export interface DashboardMeetingSummary {
  sessionId: string
  title?: string
  dealHint?: string
  engagementId?: string
  startedAt: number
  endedAt?: number
  durationMs?: number
  chunkCount: number
  signalCount: number
  starredCount: number
}

export interface DataDashboardCounts {
  streamItems: number
  operatorEvents: number
  operatorEventsByType: Record<string, number>
  fde: FdeTrainingCorpusStats
  kb: {
    entities: number
    datapoints: number
    edges: number
    traces: number
  }
  graph: {
    entities: number
    edges: number
    deals: number
    falkorConfigured: boolean
    falkorConnected: boolean
    falkorNodes?: number
    falkorGraphEdges?: number
  }
  engagements: number
}

export interface DataDashboardSnapshot {
  generatedAt: number
  counts: DataDashboardCounts
  moments: {
    starred: DashboardMomentStarred[]
    signals: DashboardMomentSignal[]
    predictions: DashboardMomentPrediction[]
    meetings: DashboardMeetingSummary[]
  }
  intention: {
    episodes: IntentionEpisode[]
    stats: IntentionEpisodeStats
  }
  insights: DashboardInsights
  activity: DashboardActivity[]
}

export interface DashboardAgentSummary {
  id: string
  source: string
  senderName: string
  intent: string
  status: string
  confidence: number
  ts: number
}

export interface DashboardTraceSummary {
  id: string
  provider?: string
  actionKind: string
  outcome: string
  timeToActionMs: number
  dominantIntention: string
  ts: number
  rawCommand?: string
}

export interface DashboardEngagementSummary {
  id: string
  clientName: string
  company?: string
  stage: string
  scope: string
  escalationLevel: number
  meetingCount: number
  feedItemCount: number
  updatedAt: number
}

export interface DashboardTaskSessionSummary {
  id: string
  correlationId: string
  startedAt: number
  endedAt: number
  signalCount: number
  actionCount: number
  traceCount: number
  durationMs: number
}

export interface DashboardDecisionSummary {
  id: string
  type: string
  phase: string
  ts: number
  detail?: string
}

export interface DashboardSourceCount {
  source: string
  count: number
}

export interface DashboardIntentionMix {
  explore: number
  plan: number
  execute: number
  reflect: number
  defer: number
  dominant: string | null
  sampleSize: number
}

export interface DashboardInsights {
  agents: {
    total: number
    interactionLog: number
    byStatus: Record<string, number>
    recent: DashboardAgentSummary[]
  }
  traces: DashboardTraceSummary[]
  engagements: DashboardEngagementSummary[]
  streamBySource: DashboardSourceCount[]
  intentionMix: DashboardIntentionMix
  taskSessions: DashboardTaskSessionSummary[]
  decisions: DashboardDecisionSummary[]
  /** Correlated operator sessions with at least one feed signal or compose action */
  trainingSessions: number
  supabaseConfigured: boolean
}

export function emptyInsights(): DashboardInsights {
  return {
    agents: { total: 0, interactionLog: 0, byStatus: {}, recent: [] },
    traces: [],
    engagements: [],
    streamBySource: [],
    intentionMix: {
      explore: 0,
      plan: 0,
      execute: 0,
      reflect: 0,
      defer: 0,
      dominant: null,
      sampleSize: 0
    },
    taskSessions: [],
    decisions: [],
    trainingSessions: 0,
    supabaseConfigured: false
  }
}
