import { randomUUID } from 'crypto'
import type { OperatorEvent, OperatorEventType } from '../../shared/operator-events'
import { isOperatorEventType } from '../../shared/operator-events'
import { operatorEventToActivity } from '../dashboard/activity'
import { emitDashboardActivities, emitDashboardActivity } from '../dashboard/broadcast'
import {
  exportOperatorEventsForTraining,
  insertOperatorEvents,
  listOperatorEvents
} from './store'

function queueSupabaseOperatorSync(events: OperatorEvent[]): void {
  if (events.length === 0) return
  void import('../supabase/sync')
    .then(({ syncOperatorEventsToSupabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured()) return
      return syncOperatorEventsToSupabase(events)
    })
    .catch((err) => {
      console.warn('[supabase] operator sync failed:', err instanceof Error ? err.message : err)
    })
}

const DEFAULT_OPERATOR_ID = process.env.STREAM_OPERATOR_ID ?? 'local'

function isValidEvent(event: unknown): event is OperatorEvent {
  if (!event || typeof event !== 'object') return false
  const e = event as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.sessionId === 'string' &&
    typeof e.operatorId === 'string' &&
    typeof e.ts === 'number' &&
    typeof e.type === 'string' &&
    isOperatorEventType(e.type) &&
    e.payload != null &&
    typeof e.payload === 'object' &&
    !Array.isArray(e.payload)
  )
}

export function recordOperatorEvents(events: unknown[]): { ok: true; inserted: number } | { ok: false; error: string } {
  const valid = events.filter(isValidEvent)
  if (valid.length === 0) {
    return { ok: false, error: 'no valid events' }
  }
  const inserted = insertOperatorEvents(valid)
  if (inserted > 0) {
    const { processOperatorEventsForEpisodes } =
      require('../intention/service') as typeof import('../intention/service')
    processOperatorEventsForEpisodes(valid.slice(-inserted))
    emitDashboardActivities(valid.slice(-inserted).map(operatorEventToActivity))
  }
  void queueSupabaseOperatorSync(valid)
  return { ok: true, inserted }
}

export function queryOperatorEvents(input: {
  since?: number
  type?: string
  limit?: number
} = {}): OperatorEvent[] {
  return listOperatorEvents(input)
}

export function exportTrainingEvents(): OperatorEvent[] {
  return exportOperatorEventsForTraining()
}

export function emitServerEvent(
  type: OperatorEventType,
  payload: Record<string, unknown>,
  opts: {
    sessionId?: string
    correlationId?: string
    surface?: string
    subjectType?: string
    subjectId?: string
    ts?: number
  } = {}
): OperatorEvent {
  const event: OperatorEvent = {
    id: `op-${randomUUID()}`,
    sessionId: opts.sessionId ?? 'server',
    operatorId: DEFAULT_OPERATOR_ID,
    correlationId: opts.correlationId,
    ts: opts.ts ?? Date.now(),
    surface: opts.surface,
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
    type,
    payload
  }
  insertOperatorEvents([event])
  const { processOperatorEventsForEpisodes } =
    require('../intention/service') as typeof import('../intention/service')
  processOperatorEventsForEpisodes([event])
  emitDashboardActivity(operatorEventToActivity(event))
  queueSupabaseOperatorSync([event])
  return event
}
