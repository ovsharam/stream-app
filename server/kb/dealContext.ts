import type { AgentProposal } from '../../shared/agent-proposal'
import type { FdeEngagement } from '../../shared/fde-engagement'
import type { KbEntity } from '../../shared/personal-kb'
import type { StreamItem } from '../../shared/types'
import {
  engagementIdForFeedItem,
  engagementIdForSession
} from '../fde/trainingStore'
import { getEngagement, listEngagements } from '../fde/engagementStore'
import type { ExtractContext } from './ontology'
import { upsertOntologyEntity } from './ontology'
import { getDatapoint, linkEntities, upsertGraphEntity } from './store'

/** Align KB entity ids with Falkor/graph vertices (`server/graph/kbToGraph.ts`). */
export function engagementDealEntityId(engagementId: string): string {
  return `gv-deal-${engagementId}`
}

export function engagementCustomerEntityId(company: string): string {
  return `gv-customer-${company.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
}

export function engagementMeetingEntityId(sessionId: string): string {
  return `gv-meeting-${sessionId}`
}

export function dealHintLabel(eng: FdeEngagement): string {
  return eng.company?.trim() || eng.clientName.trim()
}

export function resolveEngagementByFeedItem(feedItemId: string): FdeEngagement | null {
  const id = engagementIdForFeedItem(feedItemId)
  return id ? getEngagement(id) : null
}

export function resolveEngagementBySession(sessionId: string): FdeEngagement | null {
  const id = engagementIdForSession(sessionId)
  return id ? getEngagement(id) : null
}

export function resolveEngagementByProposal(proposalId: string): FdeEngagement | null {
  const match = listEngagements(500).find((e) => e.proposalIds?.includes(proposalId))
  return match ?? null
}

export function ensureEngagementDealEntity(eng: FdeEngagement): KbEntity {
  return upsertGraphEntity({
    id: engagementDealEntityId(eng.id),
    kind: 'project',
    label: eng.clientName.trim(),
    ontologyType: 'deal'
  })
}

export function ensureEngagementCustomerEntity(eng: FdeEngagement): KbEntity | undefined {
  const company = eng.company?.trim()
  if (!company) return undefined
  return upsertGraphEntity({
    id: engagementCustomerEntityId(company),
    kind: 'company',
    label: company,
    ontologyType: 'customer'
  })
}

export function ensureEngagementMeetingEntity(input: {
  sessionId: string
  title?: string
  dealHint?: string
}): KbEntity {
  const label =
    input.title?.trim() || input.dealHint?.trim() || `Meeting ${input.sessionId.slice(5, 17)}`
  return upsertGraphEntity({
    id: engagementMeetingEntityId(input.sessionId),
    kind: 'project',
    label,
    ontologyType: 'meeting'
  })
}

export function ensureEngagementGraph(eng: FdeEngagement): { deal: KbEntity; customer?: KbEntity } {
  const deal = ensureEngagementDealEntity(eng)
  const customer = ensureEngagementCustomerEntity(eng)
  if (customer) {
    linkEntities(deal.id, customer.id, 'relates_to', 1)
  }
  for (const sessionId of eng.meetingIds) {
    const meeting = ensureEngagementMeetingEntity({ sessionId, title: eng.clientName })
    linkEntities(meeting.id, deal.id, 'part_of_deal', 1)
  }
  return { deal, customer }
}

export function linkDatapointToEngagement(
  datapointId: string,
  eng: FdeEngagement,
  opts?: { sessionId?: string; senderName?: string }
): void {
  const { deal } = ensureEngagementGraph(eng)
  linkEntities(datapointId, deal.id, 'part_of_deal', 1)

  if (opts?.sessionId) {
    const meeting = ensureEngagementMeetingEntity({
      sessionId: opts.sessionId,
      title: eng.clientName
    })
    linkEntities(meeting.id, deal.id, 'part_of_deal', 1)
    linkEntities(datapointId, meeting.id, 'part_of', 1)
  }

  if (opts?.senderName?.trim()) {
    const stakeholder = upsertOntologyEntity('stakeholder', opts.senderName.trim())
    linkEntities(deal.id, stakeholder.id, 'owned_by', 1)
    linkEntities(datapointId, stakeholder.id, 'mentions', 0.8)
  }
}

export function ontologyContextForStreamItem(item: StreamItem): ExtractContext {
  const eng = resolveEngagementByFeedItem(item.id)
  const md = item.metadata ?? {}
  return {
    engagementId: eng?.id,
    dealHint: eng ? dealHintLabel(eng) : typeof md.dealHint === 'string' ? md.dealHint : undefined,
    senderName: item.sender?.name,
    senderHandle: item.sender?.handle,
    sessionId: typeof md.sessionId === 'string' ? md.sessionId : undefined,
    meetingTitle: item.source === 'meeting' ? item.title : undefined
  }
}

export function ontologyContextForMeeting(input: {
  sessionId: string
  title?: string
  dealHint?: string
}): ExtractContext {
  const eng = resolveEngagementBySession(input.sessionId)
  return {
    engagementId: eng?.id,
    sessionId: input.sessionId,
    meetingTitle: input.title,
    dealHint: eng ? dealHintLabel(eng) : input.dealHint
  }
}

export function ontologyContextForProposal(
  proposal: AgentProposal,
  eng?: FdeEngagement | null
): ExtractContext {
  const resolved = eng ?? resolveEngagementByProposal(proposal.id)
  return {
    engagementId: resolved?.id,
    dealHint: resolved ? dealHintLabel(resolved) : undefined,
    senderName: proposal.senderName,
    senderHandle: proposal.threadId
  }
}

function datapointIdsForFeedItem(feedItemId: string): string[] {
  const normalized = feedItemId.replace(/^ext-/, '')
  const ids = new Set<string>([
    `dp-${feedItemId}`,
    `dp-${normalized}`,
    `dp-ext-${normalized}`
  ])
  if (feedItemId.startsWith('agent-')) {
    ids.add(`dp-${feedItemId}`)
    ids.add(`dp-agent-${feedItemId.slice('agent-'.length)}`)
  }
  return [...ids]
}

function datapointIdsForSession(sessionId: string): string[] {
  const { listDatapoints } = require('./store') as typeof import('./store')
  return listDatapoints(2000)
    .filter((dp) => dp.sourceRef === sessionId || dp.id.includes(sessionId))
    .map((dp) => dp.id)
}

/** Re-link existing memories when an engagement gains feed items / meetings / proposals. */
export function syncEngagementKbLinks(engagementId: string): void {
  const eng = getEngagement(engagementId)
  if (!eng) return

  ensureEngagementGraph(eng)

  for (const feedItemId of eng.feedItemIds) {
    for (const dpId of datapointIdsForFeedItem(feedItemId)) {
      const dp = getDatapoint(dpId)
      if (!dp) continue
      linkDatapointToEngagement(dpId, eng, {
        senderName: typeof dp.metadata.sender === 'string' ? dp.metadata.sender : undefined
      })
    }
  }

  for (const sessionId of eng.meetingIds) {
    for (const dpId of datapointIdsForSession(sessionId)) {
      linkDatapointToEngagement(dpId, eng, { sessionId })
    }
  }

  for (const proposalId of eng.proposalIds ?? []) {
    const dp = getDatapoint(`dp-agent-${proposalId}`)
    if (dp) {
      linkDatapointToEngagement(dp.id, eng, {
        senderName: typeof dp.metadata.senderName === 'string' ? dp.metadata.senderName : undefined
      })
    }
  }
}
