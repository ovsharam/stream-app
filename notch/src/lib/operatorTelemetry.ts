import type { OperatorEvent, OperatorEventType } from '@shared/operator-events'
import { telemetryApi } from './api'

const SESSION_KEY = 'stream.operator.sessionId'
const OPERATOR_ID = 'local'
const API = 'http://localhost:3131'
const FLUSH_MS = 5000

let correlationId: string | undefined
let contextSelectedAt: number | undefined
let composeStarted = false
const queue: OperatorEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | undefined

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const id = `sess-${newId()}`
    sessionStorage.setItem(SESSION_KEY, id)
    return id
  } catch {
    return `sess-${newId()}`
  }
}

export function getCorrelationId(): string | undefined {
  return correlationId
}

export function getContextSelectedAt(): number | undefined {
  return contextSelectedAt
}

export function setTaskCorrelation(id?: string): void {
  if (id) {
    correlationId = id
    contextSelectedAt = Date.now()
    trackOperatorEvent('task_session_start', { taskId: id }, {
      subjectType: 'stream_item',
      subjectId: id
    })
    return
  }
  if (correlationId) {
    const taskId = correlationId
    trackOperatorEvent('task_session_end', { taskId }, {
      subjectType: 'stream_item',
      subjectId: taskId
    })
  }
  correlationId = undefined
  contextSelectedAt = undefined
  composeStarted = false
}

export function trackOperatorEvent(
  type: OperatorEventType,
  payload: Record<string, unknown>,
  opts?: {
    surface?: string
    subjectType?: string
    subjectId?: string
    correlationId?: string
    ts?: number
  }
): void {
  const event: OperatorEvent = {
    id: newId(),
    sessionId: getSessionId(),
    operatorId: OPERATOR_ID,
    correlationId: opts?.correlationId ?? correlationId,
    ts: opts?.ts ?? Date.now(),
    surface: opts?.surface,
    subjectType: opts?.subjectType,
    subjectId: opts?.subjectId,
    type,
    payload
  }
  queue.push(event)
  scheduleFlush()
}

export function trackComposeStart(contextItemId?: string): void {
  if (composeStarted) return
  composeStarted = true
  trackOperatorEvent('compose_start', { contextItemId }, {
    subjectType: contextItemId ? 'stream_item' : undefined,
    subjectId: contextItemId,
    surface: 'home'
  })
}

function scheduleFlush(): void {
  if (flushTimer != null) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flush(false)
  }, FLUSH_MS)
}

function flush(sync: boolean): void {
  if (queue.length === 0) return
  const events = queue.splice(0, queue.length)
  const body = JSON.stringify({ events })

  if (sync && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon(
      `${API}/api/telemetry/events`,
      new Blob([body], { type: 'application/json' })
    )
    return
  }

  void telemetryApi.ingestEvents(events).catch(() => {
    queue.unshift(...events)
    scheduleFlush()
  })
}

function initLifecycle(): void {
  if (typeof document === 'undefined') return

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush(false)
  })

  window.addEventListener('beforeunload', () => {
    flush(true)
  })
}

initLifecycle()
