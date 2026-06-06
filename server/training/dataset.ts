import type { OperatorEvent } from '../../shared/operator-events'
import type {
  FdeMeetingSummary,
  FdeSignalContext,
  FdeTaskAction,
  FdeTaskSession,
  FdeTrainingDataset
} from '../../shared/fde-training'
import type { ActionTrace } from '../../shared/personal-kb'
import { getDatapoint, listTraces } from '../kb/store'
import { exportTrainingEvents } from '../telemetry/service'

const SESSION_GAP_MS = 12 * 60_000

function itemIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const raw = payload.itemId ?? payload.eventId
  return raw != null ? String(raw).replace(/^ext-/, '') : undefined
}

function buildSignalMap(events: OperatorEvent[]): Map<string, FdeSignalContext> {
  const byItem = new Map<string, FdeSignalContext>()

  for (const event of events) {
    const itemId = itemIdFromPayload(event.payload)
    if (!itemId) continue

    const signal =
      byItem.get(itemId) ??
      ({
        itemId,
        source: String(event.payload.source ?? 'unknown')
      } satisfies FdeSignalContext)

    if (event.type === 'feed_impression' && signal.impressionTs == null) {
      signal.impressionTs = event.ts
      const dp = getDatapoint(`dp-${itemId}`)
      if (dp) {
        signal.title = dp.title
        signal.bodyPreview = dp.body.slice(0, 240)
        signal.source = dp.source
      }
    }
    if (event.type === 'feed_dwell') {
      const dwell = Number(event.payload.durationMs)
      if (Number.isFinite(dwell)) signal.dwellMs = (signal.dwellMs ?? 0) + dwell
    }
    if (event.type === 'feed_vote') {
      const vote = event.payload.vote
      if (vote === 'up' || vote === 'down') signal.vote = vote
    }
    if (event.type === 'feed_context_select') {
      signal.contextSelectTs = event.ts
      if (signal.impressionTs != null) {
        signal.timeToReactMs = Math.max(0, event.ts - signal.impressionTs)
      }
    }
    if (event.type === 'feed_thread_open') {
      signal.threadOpened = true
    }

    byItem.set(itemId, signal)
  }

  return byItem
}

function groupEventsByCorrelation(events: OperatorEvent[]): Map<string, OperatorEvent[]> {
  const groups = new Map<string, OperatorEvent[]>()
  for (const event of events) {
    const key = event.correlationId ?? `session:${event.sessionId}`
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }
  return groups
}

function mergeUngroupedSessions(groups: Map<string, OperatorEvent[]>): FdeTaskSession[] {
  const sessions: FdeTaskSession[] = []

  for (const [correlationId, groupEvents] of groups) {
    const sorted = [...groupEvents].sort((a, b) => a.ts - b.ts)
    if (sorted.length === 0) continue

    const itemIds = new Set<string>()
    for (const e of sorted) {
      const id = itemIdFromPayload(e.payload)
      if (id) itemIds.add(id)
    }

    const signalMap = buildSignalMap(sorted)
    const signals = [...itemIds]
      .map((id) => signalMap.get(id))
      .filter((s): s is FdeSignalContext => s != null)

    const actions: FdeTaskAction[] = sorted
      .filter((e) =>
        ['compose_start', 'compose_submit', 'feed_context_select', 'feed_vote', 'meeting_start', 'meeting_end'].includes(
          e.type
        )
      )
      .map((e) => ({
        type: e.type,
        ts: e.ts,
        provider: e.payload.provider != null ? String(e.payload.provider) : undefined,
        actionKind: e.payload.actionKind != null ? String(e.payload.actionKind) : undefined,
        ok: typeof e.payload.ok === 'boolean' ? e.payload.ok : undefined,
        rawCommand: e.payload.rawCommand != null ? String(e.payload.rawCommand) : undefined
      }))

    const meetings: FdeMeetingSummary[] = []
    let openMeeting: FdeMeetingSummary | null = null
    for (const e of sorted) {
      if (e.type === 'meeting_start') {
        openMeeting = {
          sessionId: String(e.payload.sessionId ?? e.subjectId ?? e.id),
          title: e.payload.title != null ? String(e.payload.title) : undefined
        }
      }
      if (e.type === 'meeting_end' && openMeeting) {
        meetings.push({
          ...openMeeting,
          durationMs: Number(e.payload.durationMs) || undefined,
          chunkCount: Number(e.payload.chunkCount) || undefined
        })
        openMeeting = null
      }
    }

    const operatorId = sorted[0].operatorId
    const sessionId = sorted[0].sessionId

    sessions.push({
      id: `task-${correlationId}`,
      correlationId,
      sessionId,
      operatorId,
      startedAt: sorted[0].ts,
      endedAt: sorted[sorted.length - 1].ts,
      signals,
      actions,
      meetings,
      traces: []
    })
  }

  return sessions.sort((a, b) => a.startedAt - b.startedAt)
}

function attachTraces(sessions: FdeTaskSession[], traces: ActionTrace[]): void {
  for (const session of sessions) {
    session.traces = traces.filter(
      (t) => t.startedAt >= session.startedAt - 2000 && t.startedAt <= session.endedAt + SESSION_GAP_MS
    )
    for (const trace of session.traces) {
      session.actions.push({
        type: 'trace',
        ts: trace.startedAt,
        provider: trace.provider,
        actionKind: trace.actionKind,
        outcome: trace.outcome,
        ok: trace.outcome !== 'ignored',
        rawCommand: trace.rawCommand
      })
    }
    session.actions.sort((a, b) => a.ts - b.ts)
  }
}

export function buildFdeTrainingDataset(): FdeTrainingDataset {
  const events = exportTrainingEvents()
  const traces = listTraces(500)
  const groups = groupEventsByCorrelation(events)
  const sessions = mergeUngroupedSessions(groups)
  attachTraces(sessions, traces)

  const operatorId = events[0]?.operatorId ?? process.env.STREAM_OPERATOR_ID ?? 'local'
  const meetings = sessions.reduce((n, s) => n + s.meetings.length, 0)

  return {
    exportedAt: Date.now(),
    operatorId,
    sessions,
    stats: {
      operatorEvents: events.length,
      actionTraces: traces.length,
      sessions: sessions.length,
      meetings
    }
  }
}
