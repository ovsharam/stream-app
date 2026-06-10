import type { CentralStreamEvent } from '@shared/cluster'
import { sanitizeDisplayText } from '@shared/displayText'
import { eventStartedAt } from './agentDuration'
import { sourceLabel } from './portalBrief'

export const HOME_AGENT_VISIBLE = 4

export type RunningAgent = {
  id: string
  title: string
  status?: string
  /** Post-call deck — open meeting for approval */
  meetingId?: string
  startedAt?: number
}

const AGENT_SOURCES = new Set([
  'cursor',
  'claude',
  'gemini',
  'mind',
  'gong',
  'perplexity',
  'cluster',
  'build'
])

const TERMINAL_STATUS = new Set([
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

/** Cursor local builds shouldn't show as active indefinitely without live proof. */
const CURSOR_BUILD_MAX_ACTIVE_MS = 45 * 60 * 1000

function agentEventSource(event: CentralStreamEvent): string {
  const metaSource = String(event.meta?.source ?? '').toLowerCase()
  if (event.source === 'insight' && AGENT_SOURCES.has(metaSource)) return metaSource
  return event.source
}

function isBuildAgentEvent(event: CentralStreamEvent): boolean {
  const source = agentEventSource(event)
  return (
    source === 'cursor' ||
    source === 'claude' ||
    event.kind === 'build_prompt' ||
    event.meta?.executor === 'claude-code'
  )
}

function isCursorBuildEvent(event: CentralStreamEvent): boolean {
  return isBuildAgentEvent(event)
}

function isRunningEvent(event: CentralStreamEvent): boolean {
  const status = String(event.meta?.agentStatus ?? '').toLowerCase()
  if (status && TERMINAL_STATUS.has(status)) return false

  if (isCursorBuildEvent(event)) {
    const ageMs = Date.now() - eventStartedAt(event)
    if (ageMs > CURSOR_BUILD_MAX_ACTIVE_MS) return false
  }

  if (
    status &&
    ['running', 'queued', 'in_progress', 'pending', 'processing', 'active', 'working'].includes(status)
  ) {
    return true
  }
  if (event.kind === 'build_prompt') {
    return Date.now() - eventStartedAt(event) <= CURSOR_BUILD_MAX_ACTIVE_MS
  }
  if (event.meta?.agentId && !TERMINAL_STATUS.has(status)) return true
  return false
}

function formatAgentStatus(raw: string): string {
  const key = raw.trim().toLowerCase()
  const labels: Record<string, string> = {
    running: 'Running',
    queued: 'Queued',
    in_progress: 'In progress',
    pending: 'Pending',
    processing: 'Processing',
    active: 'Active',
    working: 'Working',
    committing: 'Committing and pushing changes',
    pushing: 'Committing and pushing changes',
    building: 'Building',
    thinking: 'Thinking'
  }
  if (labels[key]) return labels[key]
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function taskStatus(event: CentralStreamEvent): string {
  const raw = String(event.meta?.agentStatus ?? event.meta?.phase ?? '').trim()
  if (raw) return formatAgentStatus(raw)
  if (event.kind === 'build_prompt') return 'Building'
  return 'Running'
}

function taskTitle(event: CentralStreamEvent): string {
  const agent = sourceLabel(agentEventSource(event))
  const headline = sanitizeDisplayText(event.title, 72)
  if (headline && headline.toLowerCase() !== agent.toLowerCase()) {
    return `${agent} · ${headline}`
  }
  const preview = sanitizeDisplayText(
    String(event.promptPreview ?? event.highlight ?? event.body ?? ''),
    72
  )
  if (preview) return `${agent} · ${preview}`
  return agent
}

function isClaudeCodeBuildEvent(event: CentralStreamEvent): boolean {
  const executor = String(event.meta?.executor ?? '').toLowerCase()
  return executor === 'claude-code' || (event.source === 'claude' && event.kind === 'build_prompt')
}

export function activeClaudeCodeBuild(events: CentralStreamEvent[]): RunningAgent | null {
  for (const event of events) {
    if (!isClaudeCodeBuildEvent(event)) continue
    if (!isRunningEvent(event)) continue
    return {
      id: event.id,
      title: taskTitle(event),
      status: taskStatus(event),
      startedAt: eventStartedAt(event)
    }
  }
  return null
}

export function buildRunningAgents(input: {
  events: CentralStreamEvent[]
  liveCapture?: boolean
}): RunningAgent[] {
  const rows: RunningAgent[] = []

  if (input.liveCapture) {
    rows.push({ id: 'live-capture', title: 'Meeting · Live capture', status: 'Recording' })
  }

  for (const event of input.events) {
    if (event.source === 'meeting') continue
    const source = agentEventSource(event)
    if (!AGENT_SOURCES.has(source) && event.kind !== 'build_prompt') continue
    if (!isRunningEvent(event)) continue

    rows.push({
      id: event.id,
      title: taskTitle(event),
      status: taskStatus(event),
      startedAt: eventStartedAt(event)
    })
  }

  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

/** @deprecated use buildRunningAgents */
export function buildAgentNotifications(input: Parameters<typeof buildRunningAgents>[0]): RunningAgent[] {
  return buildRunningAgents(input)
}

export type AgentNotification = RunningAgent
