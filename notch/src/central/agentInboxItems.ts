import type { AgentProposal } from '@shared/agent-proposal'
import {
  agentProposalToCardData,
  cleanLinkedInSenderName,
  summarizeProposalText,
  summarizeTheirMessage
} from '@shared/agent-proposal-ui'
import type { CentralStreamEvent } from '@shared/cluster'
import { eventStartedAt } from './agentDuration'
import { buildRunningAgents } from './homeAgents'

export const INBOX_TITLE_MAX = 40
export const INBOX_DETAIL_MAX = 64

export function truncateInbox(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.45 ? cut.slice(0, sp) : cut).trim()}…`
}

export function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function isBuildStatusEvent(event: CentralStreamEvent): boolean {
  if (event.kind === 'build_prompt') return true
  const executor = String(event.meta?.executor ?? '').toLowerCase()
  if (executor === 'claude-code' || executor === 'cursor-local' || executor === 'cursor-cloud') {
    return true
  }
  if (event.source === 'claude' && event.meta?.projectPath) return true
  return false
}

function buildChannel(event: CentralStreamEvent): string {
  const executor = String(event.meta?.executor ?? '').toLowerCase()
  if (executor === 'claude-code' || event.source === 'claude') return 'Claude Code'
  if (executor === 'cursor-cloud') return 'Cursor Cloud'
  if (executor === 'cursor-local' || event.source === 'cursor') return 'Cursor'
  return 'Build'
}

export type AgentInboxStatusItem = {
  id: string
  kind: 'status'
  channel: string
  projectName: string
  destinationLabel: string
  streamItemId: string
  startedAt?: number
  sortKey: number
}

export type AgentInboxDraftItem = {
  id: string
  kind: 'draft'
  channel: string
  title: string
  detail: string
  proposal: AgentProposal
  sortKey: number
}

export type AgentInboxItem = AgentInboxStatusItem | AgentInboxDraftItem

export function buildStatusInboxItems(events: CentralStreamEvent[]): AgentInboxStatusItem[] {
  const running = buildRunningAgents({ events })
  const items: AgentInboxStatusItem[] = []

  for (const row of running) {
    if (row.id === 'live-capture') continue
    const event = events.find((e) => e.id === row.id)
    if (!event || !isBuildStatusEvent(event)) continue

    const project = truncateInbox(
      String(event.meta?.projectName ?? '').trim() || 'Local project',
      INBOX_TITLE_MAX
    )

    items.push({
      id: `status-${event.id}`,
      kind: 'status',
      channel: buildChannel(event),
      projectName: project,
      destinationLabel: 'Build Dojo',
      streamItemId: streamItemId(event),
      startedAt: row.startedAt,
      sortKey: 1_000_000_000 - (row.startedAt ?? event.ts)
    })
  }

  return items
}

export function buildDraftInboxItems(proposals: AgentProposal[]): AgentInboxDraftItem[] {
  return proposals.map((proposal) => {
    const data = agentProposalToCardData(proposal)
    const title = truncateInbox(cleanLinkedInSenderName(data.senderName), INBOX_TITLE_MAX)
    const detail = truncateInbox(
      summarizeTheirMessage({
        rawMessage: data.rawMessage,
        senderName: data.senderName,
        brief: data.brief,
        threadMessages: data.threadMessages
      }),
      INBOX_DETAIL_MAX
    )
    const ts = data.detectedAt ?? data.createdAt
    return {
      id: `draft-${proposal.id}`,
      kind: 'draft',
      channel: 'LinkedIn',
      title: title || 'Message draft',
      detail: detail || truncateInbox(summarizeProposalText(data.linkedinReplyDraft, 72), INBOX_DETAIL_MAX),
      proposal,
      sortKey: ts
    }
  })
}

export function mergeAgentInboxItems(
  status: AgentInboxStatusItem[],
  drafts: AgentInboxDraftItem[]
): AgentInboxItem[] {
  return [...status, ...drafts].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'status' ? -1 : 1
    return b.sortKey - a.sortKey
  })
}
