import type { CentralStreamEvent } from '@shared/cluster'
import { sanitizeDisplayText } from '@shared/displayText'
import { sourceLabel } from './portalBrief'

export const HOME_AGENT_VISIBLE = 4

export type RunningAgent = {
  id: string
  title: string
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
    rows.push({ id: 'live-capture', title: 'Meeting · Live capture' })
  }

  for (const event of input.events) {
    if (event.source === 'meeting') continue
    if (!AGENT_SOURCES.has(event.source) && event.kind !== 'build_prompt') continue
    if (!isRunningEvent(event)) continue

    rows.push({
      id: event.id,
      title: taskTitle(event)
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
