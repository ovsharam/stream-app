import { randomUUID } from 'crypto'
import type { StreamItem } from '../../shared/types'
import type { Datapoint, GraphRagContext, GraphRagChunk, KbEntity } from '../../shared/personal-kb'
import { cleanAssistField, cleanKbExcerpt } from '../../shared/assistText'
import type { GraphEdgeRecord } from '../../shared/graph-sync'
import { inferIntention, blendIntention } from './intention'
import { getRecentItems } from '../db'
import {
  insertDatapoint,
  linkEntities,
  getDatapoint,
  listDatapoints,
  listEntities,
  listTraces,
  upsertEntity
} from './store'
import {
  extractWithOntology,
  applyOntologyRelations,
  upsertOntologyEntity,
  type ExtractContext
} from './ontology'
import { buildFeedOperatorContext } from '../graph/feedRanker'

function extractEntities(text: string): KbEntity[] {
  const entities: KbEntity[] = []
  const seen = new Set<string>()

  const add = (label: string, kind: KbEntity['kind']) => {
    const key = label.toLowerCase()
    if (label.length < 2 || seen.has(key)) return
    seen.add(key)
    entities.push(upsertEntity({ kind, label }))
  }

  for (const m of text.matchAll(/@([\w-]{2,40})/g)) add(m[1], 'topic')
  for (const m of text.matchAll(/#([\w-]{2,40})/g)) add(m[1], 'topic')
  for (const m of text.matchAll(/\[\[([^\]]{2,80})\]\]/g)) add(m[1], 'concept')
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
    if (!['The', 'This', 'That', 'When', 'What', 'How'].includes(m[1])) add(m[1], 'term')
  }

  return entities
}

function entitiesFromStreamItem(item: StreamItem): KbEntity[] {
  const body = [item.title, item.bodyFull ?? item.body].filter(Boolean).join('\n')
  const entities = extractEntities(body)
  const seen = new Set(entities.map((e) => e.normalized))

  const add = (label: string, kind: KbEntity['kind']) => {
    const key = label.toLowerCase().trim()
    if (key.length < 2 || seen.has(key)) return
    seen.add(key)
    entities.push(upsertEntity({ kind, label: label.trim() }))
  }

  if (item.sender?.name && item.sender.name !== item.sender.handle) {
    add(item.sender.name, 'person')
  }
  if (item.sender?.handle) add(item.sender.handle, 'topic')

  const md = item.metadata ?? {}
  if (typeof md.accountEmail === 'string') {
    const domain = md.accountEmail.split('@')[1]?.split('.')[0]
    if (domain && domain.length > 2) add(domain, 'company')
  }
  if (typeof md.dealHint === 'string') add(md.dealHint, 'company')
  if (typeof md.googleDocUrl === 'string') add('Google Doc', 'concept')

  return entities
}

function streamOntologyCtx(item: StreamItem): ExtractContext {
  const md = item.metadata ?? {}
  return {
    dealHint: typeof md.dealHint === 'string' ? md.dealHint : undefined,
    senderName: item.sender?.name,
    senderHandle: item.sender.handle,
    sessionId: typeof md.sessionId === 'string' ? md.sessionId : undefined,
    meetingTitle: item.source === 'meeting' ? item.title : undefined
  }
}

function ensureMeetingEntity(input: {
  sessionId: string
  title?: string
  dealHint?: string
}): KbEntity {
  const label =
    input.title?.trim() || input.dealHint?.trim() || `Meeting ${input.sessionId.slice(5, 17)}`
  return upsertOntologyEntity('meeting', label)
}

function writeDatapoint(
  dp: Datapoint,
  entities: KbEntity[],
  parentEntity?: KbEntity,
  ontologyCtx?: ExtractContext
): Datapoint {
  insertDatapoint(dp)

  const ontology = extractWithOntology(dp.body, {
    ...ontologyCtx,
    datapointId: dp.id,
    dealHint: ontologyCtx?.dealHint ?? (dp.metadata.dealHint as string | undefined),
    meetingTitle: ontologyCtx?.meetingTitle ?? dp.title
  })

  const allEntities = [...entities]
  const seen = new Set(allEntities.map((e) => e.id))
  for (const e of ontology.entities) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      allEntities.push(e)
    }
  }

  for (const ent of allEntities) {
    linkEntities(dp.id, ent.id, 'mentions', 1)
    if (parentEntity) {
      linkEntities(parentEntity.id, ent.id, 'relates_to', 0.5)
    }
  }
  if (parentEntity) {
    linkEntities(dp.id, parentEntity.id, 'part_of', 1)
    if (ontologyCtx?.dealHint) {
      const deal = upsertOntologyEntity('deal', ontologyCtx.dealHint)
      linkEntities(deal.id, parentEntity.id, 'part_of_deal', 1)
    }
  }

  applyOntologyRelations(ontology.relations)
  dp.entityIds = [...new Set([...dp.entityIds, ...allEntities.map((e) => e.id)])]
  insertDatapoint(dp)

  try {
    const { appendGraphDelta } = require('../graph/graphAppend') as typeof import('../graph/graphAppend')
    const { entityToVertex, datapointToVertex, makeGraphEdge } =
      require('../graph/kbToGraph') as typeof import('../graph/kbToGraph')
    const vertices = [datapointToVertex(dp), ...allEntities.map(entityToVertex)]
    if (parentEntity) vertices.push(entityToVertex(parentEntity))
    const edges: GraphEdgeRecord[] = []
    for (const ent of allEntities) {
      edges.push(makeGraphEdge(dp.id, ent.id, 'mentions', 1))
      if (parentEntity) edges.push(makeGraphEdge(parentEntity.id, ent.id, 'relates_to', 0.5))
    }
    if (parentEntity) {
      edges.push(makeGraphEdge(dp.id, parentEntity.id, 'part_of', 1))
      if (ontologyCtx?.dealHint) {
        const deal = upsertOntologyEntity('deal', ontologyCtx.dealHint)
        edges.push(makeGraphEdge(deal.id, parentEntity.id, 'part_of_deal', 1))
        vertices.push(entityToVertex(deal))
      }
    }
    for (const r of ontology.relations) {
      edges.push(makeGraphEdge(r.fromId, r.toId, r.type, r.weight))
    }
    appendGraphDelta({ vertices, edges })
  } catch (e) {
    console.warn('[graph] ingest append failed:', e instanceof Error ? e.message : e)
  }

  return dp
}

function datapointFromStreamItem(item: StreamItem): Datapoint {
  const body = [item.title, item.bodyFull ?? item.body].filter(Boolean).join('\n')
  const intention = inferIntention(body)
  const entities = entitiesFromStreamItem(item)

  const dp: Datapoint = {
    id: `dp-${item.id}`,
    kind: 'integration_event',
    source: item.source,
    sourceRef: item.id,
    title: item.title,
    body,
    ingestedAt: item.timestamp.getTime() || Date.now(),
    intention,
    entityIds: entities.map((e) => e.id),
    metadata: {
      sender: item.sender.name,
      handle: item.sender.handle,
      ...item.metadata
    }
  }

  return writeDatapoint(dp, entities, undefined, streamOntologyCtx(item))
}

/** Every feed item → graph node (idempotent upsert). */
export function ingestStreamItem(item: StreamItem): Datapoint {
  return datapointFromStreamItem(item)
}

export function ingestConsciousness(text: string, source = 'mind'): Datapoint {
  const trimmed = text.trim()
  const intention = inferIntention(trimmed)
  const entities = extractEntities(trimmed)
  const id = `dp-mind-${randomUUID()}`

  const dp: Datapoint = {
    id,
    kind: 'consciousness',
    source,
    body: trimmed,
    ingestedAt: Date.now(),
    intention,
    entityIds: entities.map((e) => e.id),
    metadata: { stream: true }
  }

  return writeDatapoint(dp, entities)
}

export function ingestMeetingChunk(input: {
  sessionId: string
  chunkIndex: number
  text: string
  ts: number
  title?: string
  dealHint?: string
}): Datapoint | null {
  const text = input.text.trim()
  if (!text) return null

  const parent = ensureMeetingEntity(input)
  const entities = extractEntities(text)

  const dp: Datapoint = {
    id: `dp-meet-${input.sessionId}-c${input.chunkIndex}`,
    kind: 'meeting_live',
    source: 'meeting',
    sourceRef: input.sessionId,
    title: input.title ? `Live · ${input.title}` : 'Live transcript',
    body: text,
    ingestedAt: input.ts,
    intention: inferIntention(text),
    entityIds: entities.map((e) => e.id),
    metadata: {
      subtype: 'chunk',
      chunkIndex: input.chunkIndex,
      dealHint: input.dealHint
    }
  }

  return writeDatapoint(dp, entities, parent, {
    sessionId: input.sessionId,
    meetingTitle: input.title,
    dealHint: input.dealHint
  })
}

export function ingestMeetingSignal(input: {
  sessionId: string
  type: string
  text: string
  ts: number
  chunkIndex: number
  title?: string
  dealHint?: string
}): Datapoint {
  const parent = ensureMeetingEntity(input)
  const body = `[${input.type}] ${input.text}`
  const entities = extractEntities(body)

  const dp: Datapoint = {
    id: `dp-meet-${input.sessionId}-sig-${input.type}-${input.chunkIndex}`,
    kind: 'meeting_live',
    source: 'meeting',
    sourceRef: input.sessionId,
    title: `Signal · ${input.type}`,
    body,
    ingestedAt: input.ts,
    intention: inferIntention(body),
    entityIds: entities.map((e) => e.id),
    metadata: {
      subtype: 'signal',
      signalType: input.type,
      chunkIndex: input.chunkIndex,
      dealHint: input.dealHint
    }
  }

  return writeDatapoint(dp, entities, parent, {
    sessionId: input.sessionId,
    meetingTitle: input.title,
    dealHint: input.dealHint
  })
}

export function ingestMeetingPrediction(input: {
  sessionId: string
  predictionId: string
  signalText: string
  sayThis: string
  followUp: string
  flag?: string
  ts: number
  title?: string
  dealHint?: string
}): Datapoint {
  const parent = ensureMeetingEntity(input)
  const body = [
    `Signal: ${input.signalText}`,
    `Say: ${input.sayThis}`,
    input.followUp ? `Follow-up: ${input.followUp}` : '',
    input.flag ? `Flag: ${input.flag}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  const entities = extractEntities(body)

  const dp: Datapoint = {
    id: `dp-${input.predictionId}`,
    kind: 'meeting_live',
    source: 'meeting',
    sourceRef: input.sessionId,
    title: 'FDE prediction',
    body,
    ingestedAt: input.ts,
    intention: inferIntention(input.sayThis),
    entityIds: entities.map((e) => e.id),
    metadata: {
      subtype: 'prediction',
      predictionId: input.predictionId,
      dealHint: input.dealHint
    }
  }

  return writeDatapoint(dp, entities, parent, {
    sessionId: input.sessionId,
    meetingTitle: input.title,
    dealHint: input.dealHint
  })
}

export function ingestMeetingStar(input: {
  sessionId: string
  text: string
  ts: number
  title?: string
  dealHint?: string
}): Datapoint {
  const parent = ensureMeetingEntity(input)
  const body = input.text.trim()
  const entities = extractEntities(body)

  const dp: Datapoint = {
    id: `dp-meet-${input.sessionId}-star-${input.ts}`,
    kind: 'meeting_live',
    source: 'meeting',
    sourceRef: input.sessionId,
    title: 'Starred moment',
    body,
    ingestedAt: input.ts,
    intention: inferIntention(body),
    entityIds: entities.map((e) => e.id),
    metadata: { subtype: 'star', dealHint: input.dealHint }
  }

  return writeDatapoint(dp, entities, parent, {
    sessionId: input.sessionId,
    meetingTitle: input.title,
    dealHint: input.dealHint
  })
}

export function ingestMobileCluster(input: {
  query: string
  headline?: string
  response?: string
  sayThis?: string
  objective?: string
  sources?: string[]
}): Datapoint {
  const query = input.query.trim()
  if (!query) throw new Error('query required')

  const summary =
    cleanAssistField(input.response ?? '', 600) ||
    cleanAssistField(input.headline ?? '', 200) ||
    cleanAssistField(query, 200)

  const entities = extractEntities(summary)
  if (input.objective) {
    entities.push(upsertEntity({ kind: 'topic', label: input.objective }))
  }

  const dp: Datapoint = {
    id: `dp-mobile-${randomUUID()}`,
    kind: 'mobile_cluster',
    source: 'mobile',
    title: cleanAssistField(input.headline ?? query, 80),
    body: summary,
    ingestedAt: Date.now(),
    intention: inferIntention(query),
    entityIds: entities.map((e) => e.id),
    metadata: {
      objective: input.objective,
      sources: input.sources ?? [],
      query,
      sayThis: input.sayThis
    }
  }

  return writeDatapoint(dp, entities)
}

export function ingestRecentStream(limit = 40): number {
  const items = getRecentItems(limit)
  let n = 0
  for (const item of items) {
    if (item.source === 'note') continue
    ingestStreamItem(item)
    n += 1
  }
  return n
}

function graphRetrievalBoost(
  dp: Datapoint,
  entityLabels: Map<string, string>,
  dealKeywords?: Set<string>,
  dealEntityIds?: Set<string>
): number {
  if (!dealKeywords?.size && !dealEntityIds?.size) return 0
  let boost = 0
  const hay = `${dp.title ?? ''} ${dp.body}`.toLowerCase()
  for (const kw of dealKeywords ?? []) {
    if (kw.length > 3 && hay.includes(kw)) boost += 0.06
  }
  for (const eid of dp.entityIds) {
    if (dealEntityIds?.has(eid)) boost += 0.12
    const label = entityLabels.get(eid)?.toLowerCase()
    if (label && hay.includes(label)) boost += 0.08
  }
  return Math.min(0.35, boost)
}

function scoreChunk(
  query: string,
  dp: Datapoint,
  entityLabels: Map<string, string>,
  graphBoost = 0
): number {
  const q = query.toLowerCase()
  const hay = `${dp.title ?? ''} ${dp.body}`.toLowerCase()
  if (!q) return 0.5

  let score = 0
  for (const word of q.split(/\s+/).filter((w) => w.length > 2)) {
    if (hay.includes(word)) score += 0.15
  }
  if (dp.kind === 'consciousness') score += 0.1
  if (dp.kind === 'meeting_live') score += 0.12
  if (dp.kind === 'mobile_cluster') score += 0.08
  const labels = dp.entityIds.map((id) => entityLabels.get(id) ?? '').join(' ')
  if (labels.toLowerCase().split(/\s+/).some((w) => q.includes(w.toLowerCase()))) score += 0.2
  score += dp.intention.execute * (/\b(do|fix|ship|task)\b/i.test(q) ? 0.15 : 0)
  score += dp.intention.explore * (/\b(why|how|learn|research)\b/i.test(q) ? 0.15 : 0)
  return Math.min(1, score + graphBoost)
}

/** GraphRAG-lite: lexical + intention-weighted retrieval (embedding slot later). */
export function retrieveContext(query: string, limit = 12): GraphRagContext {
  const datapoints = listDatapoints(400)
  const entities = listEntities(150)
  const entityLabels = new Map(entities.map((e) => [e.id, e.label]))
  const traces = listTraces(20)
  const feedCtx = buildFeedOperatorContext()
  const dealKeywords = feedCtx.activeDeal?.keywords
  const dealEntityIds = feedCtx.activeDeal?.entityIds

  const chunks: GraphRagChunk[] = datapoints
    .map((dp) => ({
      datapointId: dp.id,
      title: cleanKbExcerpt(dp.title ?? dp.body.slice(0, 80), 80),
      excerpt: cleanKbExcerpt(dp.body, 280),
      score: scoreChunk(
        query,
        dp,
        entityLabels,
        graphRetrievalBoost(dp, entityLabels, dealKeywords, dealEntityIds)
      ),
      intention: dp.intention,
      entityLabels: dp.entityIds.map((id) => entityLabels.get(id) ?? '').filter(Boolean),
      source: dp.source,
      ingestedAt: dp.ingestedAt
    }))
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const intentionProfile = chunks.reduce(
    (acc, c, i) => blendIntention(acc, c.intention, i === 0 ? 0 : 0.35 / (i + 1)),
    inferIntention(query)
  )

  const relatedEntities = entities
    .filter((e) => query && e.label.toLowerCase().includes(query.toLowerCase().split(/\s+/)[0] ?? ''))
    .slice(0, 8)

  return {
    query,
    chunks,
    relatedEntities: relatedEntities.length > 0 ? relatedEntities : entities.slice(0, 6),
    recentTraces: traces.slice(0, 8),
    intentionProfile
  }
}

/** Assist retrieval — skip recycled mobile-cluster Q&A (prevents echo loops). */
export function retrieveAssistContext(query: string, limit = 8): GraphRagContext {
  const ctx = retrieveContext(query, limit * 3)
  const chunks = ctx.chunks
    .filter((c) => {
      const dp = getDatapoint(c.datapointId)
      return dp?.kind !== 'mobile_cluster' && dp?.source !== 'mobile'
    })
    .slice(0, limit)
  return { ...ctx, chunks }
}
