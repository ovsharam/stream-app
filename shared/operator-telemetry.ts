/**
 * Operator-only engagement telemetry — NOT exposed in user-facing APIs.
 *
 * How reps treat each signal: time-to-open, time-to-action, outcome.
 * Internal use: graph maintenance, agent training, playbook tuning.
 */

export type EngagementOutcome =
  | 'ignored'
  | 'opened'
  | 'joined_meeting'
  | 'replied'
  | 'created_task'
  | 'delegated_agent'
  | 'won_motion'
  | 'lost_motion'

export interface EngagementEvent {
  operatorId: string
  userId: string
  subjectType: 'stream_item' | 'meeting' | 'thread' | 'search_query' | 'compose_action'
  subjectId: string
  source?: string
  caseId?: string
  timeToFirstActionMs?: number
  timeToAddressMs?: number
  outcome: EngagementOutcome
  actionProvider?: string
  actionKind?: string
  graphNodeIds?: string[]
  recordedAt: number
}
