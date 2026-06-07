import type { IntentionKind, IntentionVector } from './personal-kb'

export type IntentionEpisodeStatus = 'open' | 'closed'

export type IntentionEpisodeOutcome =
  | 'ignored'
  | 'engaged'
  | 'committed'
  | 'rejected'
  | 'abandoned'

export type IntentionStimulusType =
  | 'stream_item'
  | 'meeting'
  | 'meeting_signal'
  | 'agent_proposal'
  | 'compose'

export type ReactionTier = 'reflex' | 'considered' | 'delayed' | 'deferred'

export interface IntentionEpisodeLatencies {
  /** Stimulus → first depth-2+ engagement */
  reactionMs?: number
  /** Stimulus → terminal action */
  commitmentMs?: number
  /** Accumulated feed dwell */
  dwellMs?: number
}

export interface IntentionEpisode {
  id: string
  operatorId: string
  sessionId: string
  correlationId?: string
  stimulusType: IntentionStimulusType
  stimulusId: string
  stimulusSource?: string
  stimulusLabel?: string
  startedAt: number
  endedAt?: number
  status: IntentionEpisodeStatus
  outcome?: IntentionEpisodeOutcome
  /** Ordered steps — operator event types plus meeting-specific labels. */
  eventChain: string[]
  eventIds: string[]
  latencies: IntentionEpisodeLatencies
  commitmentDepth: number
  behavioralWeight: number
  reactionTier?: ReactionTier
  textIntention?: IntentionVector
  dominantIntention?: IntentionKind
  /** Last operator event timestamp applied to this episode. */
  lastEventAt?: number
}

export interface IntentionEpisodeStats {
  total: number
  open: number
  closed: number
  committed: number
  engaged: number
  abandoned: number
  ignored: number
  avgBehavioralWeight: number
  avgReactionMs: number
  /** How many closed episodes contributed to averages (may be capped for perf). */
  statsSampleSize: number
  topChains: { chain: string; count: number }[]
  reactionBySource: { source: string; medianMs: number; count: number }[]
}

export function reactionTierFromMs(ms?: number): ReactionTier | undefined {
  if (ms == null || !Number.isFinite(ms)) return undefined
  if (ms < 3_000) return 'reflex'
  if (ms < 30_000) return 'considered'
  if (ms < 300_000) return 'delayed'
  return 'deferred'
}

export function formatEpisodeChain(chain: string[]): string {
  if (chain.length === 0) return '—'
  return chain.map((t) => t.replace(/_/g, ' ')).join(' → ')
}
