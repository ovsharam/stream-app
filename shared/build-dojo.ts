import type { CentralStreamEvent } from './cluster'
import type { BuildExecutor } from './build-executor'

export type BuildRunStatus = 'running' | 'done' | 'error'

const TERMINAL_BUILD_STATUS = new Set([
  'done',
  'completed',
  'finished',
  'failed',
  'cancelled',
  'error',
  'success',
  'stale',
  'unknown'
])

function streamSource(event: CentralStreamEvent): string {
  return String(event.source)
}

export function isBuildStreamEvent(event: CentralStreamEvent): boolean {
  const source = streamSource(event)
  return (
    source === 'build' ||
    event.kind === 'build_prompt' ||
    event.meta?.executor === 'claude-code' ||
    (source === 'cursor' && Boolean(event.meta?.agentId)) ||
    (source === 'claude' && event.meta?.executor === 'claude-code')
  )
}

export function buildRunStatus(event: CentralStreamEvent): BuildRunStatus {
  const raw = String(event.meta?.agentStatus ?? event.meta?.phase ?? '').toLowerCase()
  if (raw === 'error' || raw === 'failed' || raw === 'cancelled' || raw === 'stale' || raw === 'unknown') {
    return 'error'
  }
  if (TERMINAL_BUILD_STATUS.has(raw)) return 'done'
  if (
    raw &&
    ['running', 'queued', 'in_progress', 'pending', 'processing', 'active', 'working'].includes(raw)
  ) {
    return 'running'
  }
  if (event.kind === 'build_prompt') return 'running'
  if (event.meta?.agentId) return 'running'
  return 'done'
}

export function buildExecutorFromEvent(event: CentralStreamEvent): BuildExecutor | null {
  const source = streamSource(event)
  if (event.meta?.executor === 'claude-code' || source === 'claude') return 'claude-code'
  if (event.meta?.runtime === 'cloud') return 'cursor-cloud'
  if (source === 'cursor' || event.kind === 'build_prompt' || source === 'build') {
    return 'cursor-local'
  }
  return null
}

export function buildEventStartedAt(event: CentralStreamEvent): number {
  const raw = event.meta?.startedAt
  if (raw) {
    const parsed = new Date(String(raw)).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  return event.ts
}

export function buildEventItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

export function buildEventPrompt(event: CentralStreamEvent): string {
  const query = event.meta?.query ? String(event.meta.query) : ''
  if (query) return query
  const title = event.title?.trim()
  if (title && !/^cursor build$/i.test(title) && !/^claude code build$/i.test(title)) return title
  return event.body?.trim() || 'Build run'
}

export function parseBuildLogLines(
  meta: Record<string, unknown> | undefined
): Array<{ ts: number; text: string }> {
  const raw = meta?.buildLog
  if (!raw) return []
  try {
    const rows = typeof raw === 'string' ? (JSON.parse(raw) as unknown[]) : Array.isArray(raw) ? raw : []
    return rows
      .map((row) => {
        const r = row as { ts?: number; text?: string }
        const text = String(r.text ?? '').trim()
        if (!text) return null
        return { ts: Number(r.ts ?? Date.now()), text }
      })
      .filter((r): r is { ts: number; text: string } => r != null)
  } catch {
    return []
  }
}

export type BuildDashboardStats = {
  running: number
  completed: number
  failed: number
  successRate: number | null
  trend: BuildRunStatus[]
  recentBuilds: CentralStreamEvent[]
}

export function aggregateBuildDashboard(
  events: CentralStreamEvent[],
  limit = 48
): BuildDashboardStats {
  const builds = events
    .filter(isBuildStreamEvent)
    .sort((a, b) => buildEventStartedAt(b) - buildEventStartedAt(a))
    .slice(0, limit)

  let running = 0
  let completed = 0
  let failed = 0
  const trend: BuildRunStatus[] = []

  for (const event of [...builds].reverse()) {
    const status = buildRunStatus(event)
    trend.push(status)
    if (status === 'running') running++
    else if (status === 'error') failed++
    else completed++
  }

  const terminal = completed + failed
  const successRate = terminal > 0 ? Math.round((completed / terminal) * 100) : null

  return { running, completed, failed, successRate, trend, recentBuilds: builds }
}

export type ActivityBucket = {
  label: string
  ts: number
  done: number
  failed: number
  running: number
  total: number
}

export function buildActivityTimeline(
  events: CentralStreamEvent[],
  hours = 24,
  bucketCount = 12
): ActivityBucket[] {
  const now = Date.now()
  const spanMs = hours * 60 * 60 * 1000
  const bucketMs = spanMs / bucketCount
  const start = now - spanMs

  const buckets: ActivityBucket[] = []
  for (let i = 0; i < bucketCount; i++) {
    const ts = start + i * bucketMs
    const label =
      bucketCount <= 12
        ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric' })
        : new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    buckets.push({ label, ts, done: 0, failed: 0, running: 0, total: 0 })
  }

  for (const event of events.filter(isBuildStreamEvent)) {
    const at = buildEventStartedAt(event)
    if (at < start || at > now) continue
    const idx = Math.min(bucketCount - 1, Math.floor((at - start) / bucketMs))
    const status = buildRunStatus(event)
    buckets[idx].total++
    if (status === 'running') buckets[idx].running++
    else if (status === 'error') buckets[idx].failed++
    else buckets[idx].done++
  }

  return buckets
}

export type LiveLogEntry = {
  id: string
  ts: number
  text: string
  itemId: string
  executor: BuildExecutor | 'unknown'
  status: BuildRunStatus
}

export function collectLiveBuildLogs(events: CentralStreamEvent[], maxLines = 120): LiveLogEntry[] {
  const rows: LiveLogEntry[] = []

  for (const event of events.filter(isBuildStreamEvent)) {
    const itemId = buildEventItemId(event)
    const executor = buildExecutorFromEvent(event) ?? 'unknown'
    const status = buildRunStatus(event)
    const lines = parseBuildLogLines(event.meta)
    if (lines.length > 0) {
      for (const line of lines) {
        rows.push({
          id: `${itemId}-${line.ts}-${line.text.slice(0, 24)}`,
          ts: line.ts,
          text: line.text,
          itemId,
          executor,
          status
        })
      }
    } else {
      const step = String(event.meta?.currentStep ?? '').trim()
      if (step) {
        rows.push({
          id: `${itemId}-step`,
          ts: buildEventStartedAt(event),
          text: step,
          itemId,
          executor,
          status
        })
      }
    }
  }

  return rows.sort((a, b) => b.ts - a.ts).slice(0, maxLines)
}

export type BuildDojoView = 'dashboard' | 'dojo'

export type BuildChatMessage = {
  id: string
  role: 'user' | 'agent' | 'system'
  content: string
  ts: number
  streamItemId?: string
  status?: 'running' | 'done' | 'error'
}

export type BuildThread = {
  id: string
  executor: BuildExecutor
  title: string
  projectId?: string
  projectName?: string
  streamItemId?: string
  messages: BuildChatMessage[]
  createdAt: number
  updatedAt: number
}

export const BUILD_AGENTS: Array<{
  id: BuildExecutor
  name: string
  short: string
  hint: string
}> = [
  { id: 'claude-code', name: 'Claude Code', short: 'CC', hint: 'CLI · edits in your repo' },
  { id: 'cursor-local', name: 'Cursor', short: 'Cu', hint: 'Local SDK agent' },
  { id: 'cursor-cloud', name: 'Cursor Cloud', short: '☁', hint: 'GitHub cloud run' }
]
