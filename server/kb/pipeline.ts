import { randomUUID } from 'crypto'
import type { StreamItem } from '../../shared/types'
import type { Datapoint, GraphRagContext, GraphRagChunk, KbEntity } from '../../shared/personal-kb'
import { inferIntention, blendIntention } from './intention'
import { getRecentItems } from '../db'
import {
  getDatapoint,
  insertDatapoint,
  linkEntities,
  listDatapoints,
  listEntities,
  listTraces,
  upsertEntity
} from './store'

function extractEntities(text: string): KbEntity[] {
  const entities: KbEntity[] = []
  const seen = new Set<string>()

  const add = (label: string, kind: KbEntity['kind']) => {
    const key = label.toLowerCase()
    if (label.length < 2 || seen.has(key)) return
    seen.add(key)
    entities.push(upsertEntity({ kind, label }))
  }

  for (const m of text.matchAll(/#([\w-]{2,40})/g)) add(m[1], 'topic')
  for (const m of text.matchAll(/\[\[([^\]]{2,80})\]\]/g)) add(m[1], 'concept')
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g)) {
    if (!['The', 'This', 'That', 'When', 'What', 'How'].includes(m[1])) add(m[1], 'term')
  }

  return entities
}

function datapointFromStreamItem(item: StreamItem): Datapoint {
  const body = [item.title, item.bodyFull ?? item.body].filter(Boolean).join('\n')
  const intention = inferIntention(body)
  const entities = extractEntities(body)

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
    metadata: { sender: item.sender.name, ...item.metadata }
  }

  insertDatapoint(dp)
  for (const ent of entities) {
    linkEntities(dp.id, ent.id, 'mentions', 1)
  }
  return dp
}

export function ingestStreamItem(item: StreamItem): Datapoint {
  const existing = getDatapoint(`dp-${item.id}`)
  if (existing) return existing
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

  insertDatapoint(dp)
  for (const ent of entities) {
    linkEntities(dp.id, ent.id, 'mentions', 1)
  }
  return dp
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

function scoreChunk(query: string, dp: Datapoint, entityLabels: Map<string, string>): number {
  const q = query.toLowerCase()
  const hay = `${dp.title ?? ''} ${dp.body}`.toLowerCase()
  if (!q) return 0.5

  let score = 0
  for (const word of q.split(/\s+/).filter((w) => w.length > 2)) {
    if (hay.includes(word)) score += 0.15
  }
  if (dp.kind === 'consciousness') score += 0.1
  const labels = dp.entityIds.map((id) => entityLabels.get(id) ?? '').join(' ')
  if (labels.toLowerCase().split(/\s+/).some((w) => q.includes(w.toLowerCase()))) score += 0.2
  score += dp.intention.execute * (/\b(do|fix|ship|task)\b/i.test(q) ? 0.15 : 0)
  score += dp.intention.explore * (/\b(why|how|learn|research)\b/i.test(q) ? 0.15 : 0)
  return Math.min(1, score)
}

/** GraphRAG-lite: lexical + intention-weighted retrieval (embedding slot later). */
export function retrieveContext(query: string, limit = 12): GraphRagContext {
  const datapoints = listDatapoints(300)
  const entities = listEntities(120)
  const entityLabels = new Map(entities.map((e) => [e.id, e.label]))
  const traces = listTraces(20)

  const chunks: GraphRagChunk[] = datapoints
    .map((dp) => ({
      datapointId: dp.id,
      title: dp.title ?? dp.body.slice(0, 80),
      excerpt: dp.body.slice(0, 280),
      score: scoreChunk(query, dp, entityLabels),
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
