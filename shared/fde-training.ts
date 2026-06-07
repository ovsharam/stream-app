/**
 * FDE lifecycle training corpus — discovery → build prompt → execution → feedback.
 * Append-only / versioned records linked by engagementId + sessionId.
 */

import type { ActionTrace } from './personal-kb'
import type { OperatorEvent } from './operator-events'
import type { EngagementOutcome } from './operator-telemetry'

/** Feed signal enriched with operator reaction timing — training label input. */
export type FdeSignalContext = {
  itemId: string
  source: string
  title?: string
  bodyPreview?: string
  vote?: 'up' | 'down'
  impressionTs?: number
  dwellMs?: number
  contextSelectTs?: number
  /** ms from first impression to context select (if ever) */
  timeToReactMs?: number
  threadOpened?: boolean
}

export type FdeTaskAction = {
  type: OperatorEvent['type'] | 'trace'
  ts: number
  provider?: string
  actionKind?: string
  outcome?: EngagementOutcome
  ok?: boolean
  rawCommand?: string
}

export type FdeMeetingSummary = {
  sessionId: string
  title?: string
  durationMs?: number
  chunkCount?: number
}

/** One correlated task — feed signals → actions → outcome. */
export type FdeTaskSession = {
  id: string
  correlationId: string
  sessionId: string
  operatorId: string
  startedAt: number
  endedAt: number
  signals: FdeSignalContext[]
  actions: FdeTaskAction[]
  meetings: FdeMeetingSummary[]
  traces: ActionTrace[]
}

export type FdeTrainingDataset = {
  exportedAt: number
  operatorId: string
  sessions: FdeTaskSession[]
  stats: {
    operatorEvents: number
    actionTraces: number
    sessions: number
    meetings: number
  }
}

export type FdeLifecyclePhase =
  | 'prep'
  | 'discovery'
  | 'post_call'
  | 'build'
  | 'deploy'
  | 'feedback'
  | 'maintenance'

export type ExtractionRevisionSource = 'auto' | 'fde_edit' | 'async_clarification'

export type RequirementField =
  | 'goal'
  | 'constraint'
  | 'integration'
  | 'success_metric'
  | 'out_of_scope'
  | 'open_question'
  | 'decision'
  | 'risk'
  | 'next_step'
  | 'build_prompt'

export type RequirementStatus = 'open' | 'answered' | 'approved' | 'deferred' | 'out_of_scope'

export type BuildRunExecutor =
  | 'cursor'
  | 'mcp_agent'
  | 'monday'
  | 'gmail'
  | 'slack'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'manual'
  | 'other'

export type BuildRunStatus = 'started' | 'succeeded' | 'failed' | 'cancelled'

export type FeedbackSource =
  | 'client_call'
  | 'slack'
  | 'email'
  | 'demo'
  | 'production'
  | 'fde_retro'

export type FeedbackType =
  | 'bug'
  | 'scope_creep'
  | 'ux'
  | 'performance'
  | 'misunderstanding'
  | 'praise'
  | 'other'

export type StarMomentReason =
  | 'key_requirement'
  | 'objection'
  | 'scope_decision'
  | 'technical'
  | 'upsell'
  | 'other'

export type AssistSurface = 'mobile' | 'chat' | 'stream'

export interface FdeMeetingRecord {
  sessionId: string
  engagementId?: string
  title?: string
  dealHint?: string
  startedAt: number
  endedAt?: number
  durationMs?: number
  transcript?: string
  chunkCount: number
  signalCount: number
  starredCount: number
  predictionCount: number
  createdAt: number
}

export interface FdeTranscriptChunk {
  id: string
  sessionId: string
  chunkIndex: number
  text: string
  ts: number
}

export interface FdeMeetingSignal {
  id: string
  sessionId: string
  type: string
  text: string
  chunkIndex?: number
  ts: number
}

export interface FdeStarredMoment {
  id: string
  sessionId: string
  text: string
  predictionId?: string
  reason?: StarMomentReason
  ts: number
}

export interface FdeAssistPrediction {
  id: string
  sessionId: string
  signalText: string
  sayThis: string
  followUp?: string
  flag?: string
  ts: number
}

export interface FdeExtractionRevision {
  id: string
  sessionId?: string
  engagementId: string
  version: number
  source: ExtractionRevisionSource
  summary?: string
  buildPrompt?: string
  scopeDecision?: string
  nextSteps: string[]
  flags: string[]
  questions: string[]
  decisions: string[]
  diffFromPrev?: Record<string, { before?: string; after?: string }>
  createdAt: number
}

export interface FdeRequirement {
  id: string
  engagementId: string
  sessionId?: string
  field: RequirementField
  value: string
  status: RequirementStatus
  source: ExtractionRevisionSource | 'feedback'
  createdAt: number
  updatedAt: number
}

export interface FdeBuildRun {
  id: string
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
}

export interface FdeFeedbackEvent {
  id: string
  engagementId: string
  source: FeedbackSource
  feedbackType: FeedbackType
  text: string
  requirementId?: string
  buildRunId?: string
  ts: number
}

export interface FdeDecisionEvent {
  id: string
  engagementId?: string
  sessionId?: string
  phase: FdeLifecyclePhase
  type: string
  inputRef?: string
  autoSuggestion?: string
  humanAction?: string
  outcome?: string
  metadata?: Record<string, unknown>
  ts: number
}

export interface FdeAssistInvocation {
  id: string
  engagementId?: string
  sessionId?: string
  surface: AssistSurface
  query: string
  predictionId?: string
  suggestion?: string
  response?: string
  pageContext?: { url?: string; title?: string; excerpt?: string }
  adopted?: boolean
  ts: number
}

export interface FdeTrainingCorpusStats {
  meetingRecords: number
  transcriptChunks: number
  signals: number
  starredMoments: number
  predictions: number
  extractionRevisions: number
  requirements: number
  buildRuns: number
  feedbackEvents: number
  decisionEvents: number
  assistInvocations: number
}
