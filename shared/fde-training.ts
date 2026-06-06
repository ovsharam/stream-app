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
