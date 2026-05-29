import { randomUUID } from 'crypto'
import type { ActionTrace } from '../../shared/personal-kb'
import type { EngagementOutcome } from '../../shared/operator-telemetry'
import { inferIntention } from './intention'
import { getItemSeenAt, insertTrace, listTraces } from './store'

const activeSessions = new Map<string, number>()

export function markStreamItemSeen(itemId: string): void {
  activeSessions.set(itemId, Date.now())
  const { markItemSeen } = require('./store') as typeof import('./store')
  markItemSeen(itemId, Date.now())
}

export function recordComposeAction(input: {
  operatorId: string
  subjectId: string
  contextItemId?: string
  provider: string
  actionKind: string
  rawCommand: string
  ok: boolean
  startedAt: number
}): ActionTrace {
  const completedAt = Date.now()
  const seenAt = input.contextItemId ? getItemSeenAt(input.contextItemId) : undefined
  const timeToActionMs = seenAt ? Math.max(0, input.startedAt - seenAt) : 0

  const recent = listTraces(5).filter((t) => t.completedAt > input.startedAt - 120_000)
  const concurrentTraceIds = recent.map((t) => t.id)

  const intention = inferIntention(input.rawCommand)
  const outcome: EngagementOutcome = input.ok ? 'created_task' : 'ignored'
  if (input.actionKind === 'reply' || input.actionKind === 'send') {
    // mapped below if ok
  }

  let mappedOutcome: EngagementOutcome = outcome
  if (input.ok) {
    if (input.actionKind === 'reply' || input.actionKind === 'send') mappedOutcome = 'replied'
    else if (input.provider === 'monday') mappedOutcome = 'created_task'
    else if (['claude', 'gemini', 'perplexity', 'cursor'].includes(input.provider))
      mappedOutcome = 'delegated_agent'
    else mappedOutcome = 'created_task'
  }

  const trace: ActionTrace = {
    id: `trace-${randomUUID()}`,
    datapointId: input.contextItemId ? `dp-${input.contextItemId.replace(/^ext-/, '')}` : undefined,
    subjectType: 'compose_action',
    subjectId: input.subjectId,
    operatorId: input.operatorId,
    provider: input.provider,
    actionKind: input.actionKind,
    rawCommand: input.rawCommand,
    seenAt: seenAt ?? input.startedAt,
    startedAt: input.startedAt,
    completedAt,
    timeToActionMs,
    concurrentTraceIds,
    outcome: mappedOutcome,
    intention
  }

  insertTrace(trace)
  return trace
}
