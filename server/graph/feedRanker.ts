import type { CentralStreamEvent } from '../../shared/cluster'
import type { FeedRankBreakdown } from '../../shared/graph-sync'
import type { IntentionVector } from '../../shared/personal-kb'
import type { OperatorEvent } from '../../shared/operator-events'
import { listEngagements } from '../fde/engagementStore'
import { getActiveMeeting } from '../cluster/meetingPipeline'
import { blendIntention, inferIntention } from '../kb/intention'
import { getDatapoint, getItemSeenAt, listEntities, listEdges, listTraces } from '../kb/store'
import { queryOperatorEvents } from '../telemetry/service'
import { feedRankDebug, feedRankingEnabled, RANK_WEIGHTS } from './rankConfig'

const FRESH_HALF_LIFE_MS = 6 * 60 * 60 * 1000
const SEEN_IGNORE_MS = 4 * 60 * 60 * 1000

/** Inbox-style sources — always newest first, not ML-ranked. */
const RECENCY_SOURCES = new Set(['gmail', 'slack', 'discord', 'x'])

function sortByRecency(events: CentralStreamEvent[]): CentralStreamEvent[] {
  return [...events].sort((a, b) => b.ts - a.ts)
}

/** Integration feed items (Gmail, Slack, Monday, …) sort by time; meetings/signals use ranker. */
function usesRecencySort(event: CentralStreamEvent): boolean {
  if (RECENCY_SOURCES.has(event.source)) return true
  if (
    event.kind === 'integration' &&
    event.source !== 'meeting' &&
    event.source !== 'gong'
  ) {
    return true
  }
  return false
}

function usesPredictiveRank(event: CentralStreamEvent): boolean {
  if (usesRecencySort(event)) return false
  if (event.source === 'meeting' || event.kind === 'build_prompt') return true
  if (['signal', 'insight', 'assist', 'transcript_live', 'action'].includes(event.kind)) return true
  if (event.source === 'gong') return true
  return false
}

export type FeedOperatorContext = {
  now: number
  intention: IntentionVector
  activeDeal?: {
    id: string
    clientName: string
    company?: string
    stage: string
    escalationLevel: number
    entityIds: Set<string>
    keywords: Set<string>
  }
  liveMeeting: boolean
  itemSignals: Map<
    string,
    {
      impressionTs?: number
      dwellMs: number
      vote?: 'up' | 'down'
      contextSelected?: boolean
      threadOpened?: boolean
    }
  >
}

function normalizeItemId(eventId: string): string {
  return eventId.replace(/^ext-/, '')
}

function itemIdFromEvent(event: CentralStreamEvent): string {
  const metaId = event.meta?.itemId ? String(event.meta.itemId) : null
  return normalizeItemId(metaId ?? event.id)
}

export function buildFeedOperatorContext(now = Date.now()): FeedOperatorContext {
  const events = queryOperatorEvents({ since: now - 7 * 24 * 60 * 60 * 1000, limit: 400 })
  const itemSignals = new Map<
    string,
    {
      impressionTs?: number
      dwellMs: number
      vote?: 'up' | 'down'
      contextSelected?: boolean
      threadOpened?: boolean
    }
  >()

  for (const ev of events) {
    ingestOperatorEvent(ev, itemSignals)
  }

  const traces = listTraces(30)
  let intention = inferIntention('')
  for (const [i, t] of traces.entries()) {
    intention = blendIntention(intention, t.intention, i === 0 ? 0.55 : 0.2 / (i + 1))
  }
  for (const ev of events.slice(-12)) {
    if (ev.type === 'compose_start' || ev.type === 'compose_submit') {
      const cmd = String(ev.payload.rawCommand ?? ev.payload.text ?? '')
      if (cmd) intention = blendIntention(intention, inferIntention(cmd), 0.35)
    }
  }

  const engagements = listEngagements(50)
  const activeDeal =
    engagements.find((e) => e.escalationLevel > 0) ??
    engagements.find((e) => e.stage === 'build') ??
    engagements.find((e) => e.stage === 'context') ??
    engagements.find((e) => e.stage === 'intake') ??
    engagements[0]

  let dealContext: FeedOperatorContext['activeDeal'] | undefined
  if (activeDeal) {
    const dealId = `gv-deal-${activeDeal.id}`
    const entityIds = new Set<string>([dealId])
    const keywords = new Set<string>()
    const addKw = (s?: string) => {
      if (!s) return
      for (const w of s.toLowerCase().split(/\W+/).filter((x) => x.length > 2)) keywords.add(w)
    }
    addKw(activeDeal.clientName)
    addKw(activeDeal.company)
    for (const f of activeDeal.flags) addKw(f)
    for (const q of activeDeal.openQuestions) addKw(q)

    for (const edge of listEdges(500)) {
      if (edge.fromId === dealId || edge.toId === dealId) {
        entityIds.add(edge.fromId)
        entityIds.add(edge.toId)
      }
    }

    dealContext = {
      id: activeDeal.id,
      clientName: activeDeal.clientName,
      company: activeDeal.company,
      stage: activeDeal.stage,
      escalationLevel: activeDeal.escalationLevel,
      entityIds,
      keywords
    }
  }

  return {
    now,
    intention,
    activeDeal: dealContext,
    liveMeeting: Boolean(getActiveMeeting()),
    itemSignals
  }
}

function ingestOperatorEvent(
  ev: OperatorEvent,
  itemSignals: Map<
    string,
    {
      impressionTs?: number
      dwellMs: number
      vote?: 'up' | 'down'
      contextSelected?: boolean
      threadOpened?: boolean
    }
  >
): void {
  const payload = ev.payload
  const rawId = payload.eventId ?? payload.itemId
  if (rawId == null) return
  const itemId = normalizeItemId(String(rawId))
  const sig = itemSignals.get(itemId) ?? { dwellMs: 0 }

  if (ev.type === 'feed_impression' && sig.impressionTs == null) {
    sig.impressionTs = ev.ts
  }
  if (ev.type === 'feed_dwell') {
    const d = Number(payload.durationMs)
    if (Number.isFinite(d)) sig.dwellMs += d
  }
  if (ev.type === 'feed_vote') {
    const vote = payload.vote
    if (vote === 'up' || vote === 'down') sig.vote = vote
  }
  if (ev.type === 'feed_context_select') sig.contextSelected = true
  if (ev.type === 'feed_thread_open') sig.threadOpened = true

  itemSignals.set(itemId, sig)
}

function intentionForEvent(event: CentralStreamEvent): IntentionVector {
  const dp = getDatapoint(`dp-${itemIdFromEvent(event)}`)
  if (dp) return dp.intention
  return inferIntention(`${event.title} ${event.body}`)
}

function scoreIntentionMatch(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  const itemIntention = intentionForEvent(event)
  const op = ctx.intention
  const dot =
    op.explore * itemIntention.explore +
    op.plan * itemIntention.plan +
    op.execute * itemIntention.execute +
    op.reflect * itemIntention.reflect +
    op.defer * itemIntention.defer
  return Math.min(1, dot * 1.4)
}

function scoreGraphSalience(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  if (!ctx.activeDeal) return 0.15
  const hay = `${event.title} ${event.body}`.toLowerCase()
  let score = 0

  if (ctx.activeDeal.company && hay.includes(ctx.activeDeal.company.toLowerCase())) score += 0.45
  if (hay.includes(ctx.activeDeal.clientName.toLowerCase())) score += 0.35

  let keywordHits = 0
  for (const kw of ctx.activeDeal.keywords) {
    if (kw.length > 3 && hay.includes(kw)) keywordHits += 1
  }
  score += Math.min(0.35, keywordHits * 0.08)

  const dp = getDatapoint(`dp-${itemIdFromEvent(event)}`)
  if (dp) {
    for (const eid of dp.entityIds) {
      if (ctx.activeDeal.entityIds.has(eid)) score += 0.15
    }
  }

  const entities = listEntities(80)
  for (const ent of entities) {
    if (!ctx.activeDeal.entityIds.has(ent.id)) continue
    if (hay.includes(ent.label.toLowerCase())) score += 0.12
  }

  if (event.meta?.sessionId && ctx.activeDeal) score += 0.25
  return Math.min(1, score)
}

function scoreUrgency(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  let score = 0.1
  if (ctx.liveMeeting && (event.kind === 'transcript_live' || event.kind === 'signal' || event.kind === 'assist')) {
    score += 0.55
  }
  if (event.source === 'meeting' || event.kind === 'build_prompt') score += 0.35
  if (event.kind === 'action' || event.meta?.proposedActions) score += 0.25
  if (ctx.activeDeal && ctx.activeDeal.escalationLevel > 0) {
    const hay = `${event.title} ${event.body}`.toLowerCase()
    if (ctx.activeDeal.company && hay.includes(ctx.activeDeal.company.toLowerCase())) {
      score += 0.2 * ctx.activeDeal.escalationLevel
    }
  }
  if (event.joinable) score += 0.4
  return Math.min(1, score)
}

function scoreEngagementPrior(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  const itemId = itemIdFromEvent(event)
  const sig = ctx.itemSignals.get(itemId)
  if (!sig) return 0.05
  let score = 0.05
  if (sig.contextSelected || sig.threadOpened) score += 0.65
  if (sig.dwellMs > 3000) score += 0.35
  if (sig.dwellMs > 12000) score += 0.15
  if (sig.vote === 'up') score += 0.5
  return Math.min(1, score)
}

function scoreFreshness(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  const age = Math.max(0, ctx.now - event.ts)
  return Math.exp(-age / FRESH_HALF_LIFE_MS)
}

function scorePenalty(ctx: FeedOperatorContext, event: CentralStreamEvent): number {
  const itemId = itemIdFromEvent(event)
  const sig = ctx.itemSignals.get(itemId)
  let penalty = 0
  if (sig?.vote === 'down') penalty += 0.85
  const seenAt = getItemSeenAt(itemId) ?? sig?.impressionTs
  if (seenAt && ctx.now - seenAt > SEEN_IGNORE_MS) {
    const acted = sig?.contextSelected || sig?.threadOpened || (sig?.dwellMs ?? 0) > 2000
    if (!acted) penalty += 0.45
  }
  return Math.min(1, penalty)
}

export function scoreFeedEvent(
  event: CentralStreamEvent,
  ctx: FeedOperatorContext
): FeedRankBreakdown {
  const urgency = scoreUrgency(ctx, event)
  const intention = scoreIntentionMatch(ctx, event)
  const graphSalience = scoreGraphSalience(ctx, event)
  const engagementPrior = scoreEngagementPrior(ctx, event)
  const freshness = scoreFreshness(ctx, event)
  const penalty = scorePenalty(ctx, event)

  const total =
    RANK_WEIGHTS.urgency * urgency +
    RANK_WEIGHTS.intention * intention +
    RANK_WEIGHTS.graphSalience * graphSalience +
    RANK_WEIGHTS.engagementPrior * engagementPrior +
    RANK_WEIGHTS.freshness * freshness -
    RANK_WEIGHTS.penalty * penalty

  return {
    total,
    urgency,
    intention,
    graphSalience,
    engagementPrior,
    freshness,
    penalty
  }
}

export function rankFeedEvents(events: CentralStreamEvent[]): CentralStreamEvent[] {
  if (!feedRankingEnabled()) {
    return sortByRecency(events)
  }

  const recency: CentralStreamEvent[] = []
  const ranked: CentralStreamEvent[] = []
  const other: CentralStreamEvent[] = []

  for (const event of events) {
    if (usesRecencySort(event)) recency.push(event)
    else if (usesPredictiveRank(event)) ranked.push(event)
    else other.push(event)
  }

  const ctx = buildFeedOperatorContext()
  const scored = ranked.map((event) => {
    const breakdown = scoreFeedEvent(event, ctx)
    if (!feedRankDebug()) return { event, breakdown }
    return {
      event: {
        ...event,
        meta: {
          ...event.meta,
          rankScore: breakdown.total.toFixed(3),
          rankBreakdown: JSON.stringify(breakdown)
        }
      },
      breakdown
    }
  })

  scored.sort((a, b) => {
    if (b.breakdown.total !== a.breakdown.total) return b.breakdown.total - a.breakdown.total
    return b.event.ts - a.event.ts
  })

  const rankedSorted = scored.map((s) => s.event)
  const recencySorted = sortByRecency(recency)
  const otherSorted = sortByRecency(other)

  // Merge buckets, then sort chronologically so inbox + agent cards interleave by time.
  const livePinned = (e: CentralStreamEvent) =>
    e.kind === 'transcript_live' || e.kind === 'assist'
  const merged = [...rankedSorted, ...recencySorted, ...otherSorted]
  const pinned = merged.filter(livePinned)
  const rest = merged.filter((e) => !livePinned(e))
  return [...sortByRecency(pinned), ...sortByRecency(rest)]
}

export function explainFeedRank(eventId: string, events: CentralStreamEvent[]): FeedRankBreakdown | null {
  const event = events.find((e) => e.id === eventId || itemIdFromEvent(e) === normalizeItemId(eventId))
  if (!event) return null
  return scoreFeedEvent(event, buildFeedOperatorContext())
}
