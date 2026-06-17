import type { KbGraphLink, KbGraphNode, KbGraphSnapshot } from '../../shared/kb-graph'
import type { KbEntity, KbEdge } from '../../shared/personal-kb'
import { loadOntology } from './ontology'
import {
  countDatapoints,
  countEdges,
  countEntities,
  countTraces,
  listAllEdges,
  listDatapoints,
  listEntities
} from './store'

export type KbGraphViewMode = 'structured' | 'memories' | 'full'

const ONTOLOGY_RELATIONS = new Set([
  'has_requirement',
  'requires_feature',
  'blocked_by',
  'subject_to',
  'integrates_with',
  'owned_by',
  'part_of_deal',
  'targets_launch',
  'budget_for'
])

function excerpt(body: string, max = 80): string {
  const t = body.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function isEntityId(id: string): boolean {
  return id.startsWith('ent-')
}

function isDatapointId(id: string): boolean {
  return id.startsWith('dp-')
}

function isNoiseEntity(e: KbEntity): boolean {
  if (e.ontologyType) return false
  if (e.mentionCount >= 3) return false
  if (['person', 'company', 'project'].includes(e.kind)) return e.mentionCount < 2
  if (e.kind === 'term') {
    if (/@/.test(e.label) || /\.com\b/i.test(e.label)) return true
    if (e.label.length > 48) return true
    return e.mentionCount < 2
  }
  return e.kind === 'term' && e.mentionCount < 2
}

function entityPriority(e: KbEntity): number {
  let score = e.mentionCount
  if (e.ontologyType) score += 50
  if (e.kind === 'company' || e.kind === 'person' || e.kind === 'project') score += 10
  if (isNoiseEntity(e)) score -= 100
  return score
}

function edgePriority(edge: KbEdge): number {
  if (edge.relation === 'mentions') return 1
  if (ONTOLOGY_RELATIONS.has(edge.relation)) return 20 + edge.weight * 2
  if (edge.relation === 'part_of' || edge.relation === 'relates_to') return 8
  return 4 + edge.weight
}

function buildConnectedSnapshot(opts: {
  mode: KbGraphViewMode
  maxEntities: number
  maxDatapoints: number
  maxEdges: number
  entityById: Map<string, KbEntity>
  allEdges: KbEdge[]
}): { nodeIds: Set<string>; links: KbGraphLink[] } {
  const { mode, maxEntities, maxDatapoints, maxEdges, entityById, allEdges } = opts
  const includeMentions = mode === 'memories' || mode === 'full'
  const filterNoise = mode === 'structured'

  const entityEdges = allEdges.filter((e) => {
    if (!includeMentions && e.relation === 'mentions') return false
    if (isEntityId(e.fromId) && isEntityId(e.toId)) return true
    if (includeMentions && isDatapointId(e.fromId) && isEntityId(e.toId)) return true
    if (includeMentions && isEntityId(e.fromId) && isDatapointId(e.toId)) return true
    return false
  })

  const adjacency = new Map<string, { neighbor: string; edge: KbEdge }[]>()
  for (const edge of entityEdges) {
    for (const [a, b] of [
      [edge.fromId, edge.toId],
      [edge.toId, edge.fromId]
    ] as const) {
      const list = adjacency.get(a) ?? []
      list.push({ neighbor: b, edge })
      adjacency.set(a, list)
    }
  }

  const seeds = [...entityById.values()]
    .filter((e) => !filterNoise || !isNoiseEntity(e))
    .sort((a, b) => entityPriority(b) - entityPriority(a))
    .slice(0, Math.min(80, maxEntities))

  const nodeIds = new Set<string>()
  const queue = [...seeds.map((s) => s.id)]
  for (const id of queue) nodeIds.add(id)

  while (queue.length > 0 && nodeIds.size < maxEntities + maxDatapoints) {
    const id = queue.shift()!
    const neighbors = adjacency.get(id) ?? []
    neighbors.sort((a, b) => edgePriority(b.edge) - edgePriority(a.edge))
    for (const { neighbor, edge } of neighbors) {
      if (nodeIds.has(neighbor)) continue
      if (isEntityId(neighbor)) {
        const ent = entityById.get(neighbor)
        if (filterNoise && ent && isNoiseEntity(ent) && edge.relation !== 'mentions') continue
        if (nodeIds.size >= maxEntities + maxDatapoints) break
        nodeIds.add(neighbor)
        queue.push(neighbor)
      } else if (isDatapointId(neighbor) && includeMentions) {
        const entityCount = [...nodeIds].filter(isEntityId).length
        const dpCount = [...nodeIds].filter(isDatapointId).length
        if (dpCount >= maxDatapoints) continue
        if (entityCount >= maxEntities && edge.relation !== 'mentions') continue
        nodeIds.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  if (mode === 'full') {
    for (const e of [...entityById.values()].slice(0, maxEntities)) nodeIds.add(e.id)
  }

  const links: KbGraphLink[] = []
  for (const edge of entityEdges.sort((a, b) => edgePriority(b) - edgePriority(a))) {
    if (links.length >= maxEdges) break
    if (!nodeIds.has(edge.fromId) || !nodeIds.has(edge.toId)) continue
    links.push({
      id: edge.id,
      source: edge.fromId,
      target: edge.toId,
      relation: edge.relation,
      weight: edge.weight
    })
  }

  return { nodeIds, links }
}

export function buildKbGraphSnapshot(opts?: {
  mode?: KbGraphViewMode
  maxEntities?: number
  maxDatapoints?: number
  maxEdges?: number
}): KbGraphSnapshot {
  const mode = opts?.mode ?? 'structured'
  const maxEntities = opts?.maxEntities ?? (mode === 'structured' ? 220 : 400)
  const maxDatapoints = opts?.maxDatapoints ?? (mode === 'memories' ? 160 : mode === 'full' ? 120 : 0)
  const maxEdges = opts?.maxEdges ?? (mode === 'structured' ? 600 : 1200)

  const entities = listEntities(Math.max(maxEntities * 3, 500))
  const entityById = new Map(entities.map((e) => [e.id, e]))
  const allEdges = listAllEdges()

  const { nodeIds, links } = buildConnectedSnapshot({
    mode,
    maxEntities,
    maxDatapoints,
    maxEdges,
    entityById,
    allEdges
  })

  const datapoints =
    maxDatapoints > 0
      ? listDatapoints(maxDatapoints * 3).filter((d) => nodeIds.has(d.id)).slice(0, maxDatapoints)
      : []

  for (const dp of datapoints) nodeIds.add(dp.id)

  const nodes: KbGraphNode[] = []
  for (const id of nodeIds) {
    const ent = entityById.get(id)
    if (ent) {
      nodes.push({
        id: ent.id,
        kind: 'entity',
        label: ent.label,
        type: ent.kind,
        ontologyType: ent.ontologyType,
        mentionCount: ent.mentionCount,
        ingestedAt: ent.updatedAt
      })
      continue
    }
    const dp = datapoints.find((d) => d.id === id)
    if (dp) {
      nodes.push({
        id: dp.id,
        kind: 'datapoint',
        label: dp.title?.trim() || excerpt(dp.body, 48),
        type: dp.kind,
        source: dp.source,
        intention: dp.intention.dominant,
        ingestedAt: dp.ingestedAt,
        excerpt: excerpt(dp.body, 160)
      })
    }
  }

  const nodeIdSet = new Set(nodes.map((n) => n.id))
  const visibleLinks = links.filter((l) => nodeIdSet.has(l.source) && nodeIdSet.has(l.target))

  const ontologyEdgeCount = visibleLinks.filter((l) => ONTOLOGY_RELATIONS.has(l.relation)).length
  const mentionEdgeCount = visibleLinks.filter((l) => l.relation === 'mentions').length

  return {
    nodes,
    links: visibleLinks,
    stats: {
      entities: countEntities(),
      datapoints: countDatapoints(),
      edges: countEdges(),
      traces: countTraces(),
      ontology: loadOntology().name ?? 'default',
      viewedEntities: nodes.filter((n) => n.kind === 'entity').length,
      viewedEdges: visibleLinks.length,
      ontologyEdges: ontologyEdgeCount,
      mentionEdges: mentionEdgeCount
    },
    generatedAt: Date.now()
  }
}
