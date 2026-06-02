import type { CentralStreamEvent } from '@shared/cluster'
import { sanitizeDisplayText } from '@shared/displayText'
import { sourceLabel } from './portalBrief'

export const HOME_AGENT_VISIBLE = 4

export type RunningAgent = {
  id: string
  title: string
  status?: string
  /** Post-call deck — open meeting for approval */
  meetingId?: string
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

const TERMINAL_STATUS = new Set(['done', 'completed', 'finished', 'failed', 'cancelled', 'error', 'success'])

function isRunningEvent(event: CentralStreamEvent): boolean {
  const status = String(event.meta?.agentStatus ?? '').toLowerCase()
  if (status && TERMINAL_STATUS.has(status)) return false
  if (
    status &&
    ['running', 'queued', 'in_progress', 'pending', 'processing', 'active', 'working'].includes(status)
  ) {
    return true
  }
  if (event.kind === 'build_prompt') return true
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
  const agent = sourceLabel(event.source)
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
    if (!AGENT_SOURCES.has(event.source) && event.kind !== 'build_prompt') continue
    if (!isRunningEvent(event)) continue

    rows.push({
      id: event.id,
      title: taskTitle(event),
      status: taskStatus(event)
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
