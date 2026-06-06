/**
 * Unified operator capture events for FDE baseline training.
 * Complements EngagementEvent in operator-telemetry.ts — not a replacement.
 */

export type OperatorEventType =
  | 'feed_impression'
  | 'feed_dwell'
  | 'feed_vote'
  | 'feed_context_select'
  | 'feed_thread_open'
  | 'compose_start'
  | 'compose_submit'
  | 'nav_change'
  | 'panel_toggle'
  | 'meeting_start'
  | 'meeting_end'
  | 'task_session_start'
  | 'task_session_end'

export type OperatorSurface =
  | 'feed'
  | 'stream_rail'
  | 'home'
  | 'workspace'
  | 'settings'
  | 'integrations'
  | 'build'
  | 'notes'
  | 'navapp'

export interface OperatorEventBase {
  id: string
  sessionId: string
  operatorId: string
  correlationId?: string
  ts: number
  surface?: string
  subjectType?: string
  subjectId?: string
  type: OperatorEventType
  payload: Record<string, unknown>
}

export type OperatorEvent = OperatorEventBase

export interface FeedImpressionPayload {
  eventId: string
  source: string
  itemId?: string
}

export interface FeedDwellPayload {
  eventId: string
  source: string
  itemId?: string
  durationMs: number
}

export interface FeedVotePayload {
  eventId: string
  source: string
  itemId?: string
  vote: 'up' | 'down' | 'clear'
}

export interface FeedContextSelectPayload {
  itemId: string
  source?: string
  via?: string
}

export interface FeedThreadOpenPayload {
  itemId: string
  source?: string
  day?: string
}

export interface ComposeStartPayload {
  contextItemId?: string
}

export interface ComposeSubmitPayload {
  provider: string
  intent: string
  contextItemId?: string
  ok: boolean
  timeToActionMs?: number
}

export interface NavChangePayload {
  from: string
  to: string
  surface?: string
  area?: string
  page?: string
}

export interface PanelTogglePayload {
  panel: string
  open: boolean
}

export interface MeetingStartPayload {
  sessionId: string
  title?: string
  dealHint?: string
}

export interface MeetingEndPayload {
  sessionId: string
  durationMs: number
  chunkCount: number
  title?: string
  dealHint?: string
  feedItemId?: string
}

export interface TaskSessionPayload {
  taskId: string
}

export const OPERATOR_EVENT_TYPES: OperatorEventType[] = [
  'feed_impression',
  'feed_dwell',
  'feed_vote',
  'feed_context_select',
  'feed_thread_open',
  'compose_start',
  'compose_submit',
  'nav_change',
  'panel_toggle',
  'meeting_start',
  'meeting_end',
  'task_session_start',
  'task_session_end'
]

export function isOperatorEventType(value: string): value is OperatorEventType {
  return (OPERATOR_EVENT_TYPES as string[]).includes(value)
}
