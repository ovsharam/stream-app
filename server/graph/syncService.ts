import type { GraphEdgeRecord, GraphSyncResult, GraphVertex } from '../../shared/graph-sync'
import { countEngagements, listEngagements } from '../fde/engagementStore'
import { listAllEntities, listAllEdges } from '../kb/store'
import { FalkorGraphAdapter } from './adapters/falkorAdapter'
import { appendGraphDelta, flushGraphAppend } from './graphAppend'
import { entityToVertex, engagementToGraph, makeGraphEdge, requirementToGraph } from './kbToGraph'
import { falkorConfigured, pingFalkor } from './falkorClient'
import { falkorGraphCounts } from './queryService'
import type { FdeEngagement } from '../../shared/fde-engagement'

function mergeUniqueVertices(vertices: GraphVertex[]): GraphVertex[] {
  const byId = new Map<string, GraphVertex>()
  for (const v of vertices) byId.set(v.id, v)
  return [...byId.values()]
}

function mergeUniqueEdges(edges: GraphEdgeRecord[]): GraphEdgeRecord[] {
  const byId = new Map<string, GraphEdgeRecord>()
  for (const e of edges) byId.set(e.id, e)
  return [...byId.values()]
}

/** Full graph read from SQLite — used for backfill/reconcile only, not routine ingest. */
export function buildGraphSnapshotFromStore(): { vertices: GraphVertex[]; edges: GraphEdgeRecord[] } {
  const vertices: GraphVertex[] = []
  const edges: GraphEdgeRecord[] = []

  for (const eng of listEngagements(10_000)) {
    const chunk = engagementToGraph(eng)
    vertices.push(...chunk.vertices)
    edges.push(...chunk.edges)
  }

  try {
    const { listAllRequirements } = require('../fde/trainingStore') as typeof import('../fde/trainingStore')
    for (const req of listAllRequirements(10_000)) {
      const chunk = requirementToGraph(req)
      vertices.push(...chunk.vertices)
      edges.push(...chunk.edges)
    }
  } catch {
    /* training tables may be empty */
  }

  for (const ent of listAllEntities()) {
    vertices.push(entityToVertex(ent))
  }

  for (const edge of listAllEdges()) {
    edges.push(makeGraphEdge(edge.fromId, edge.toId, edge.relation, edge.weight))
  }

  return {
    vertices: mergeUniqueVertices(vertices),
    edges: mergeUniqueEdges(edges)
  }
}

/** Append one engagement + its requirements after post-call (incremental, not full rebuild). */
export async function appendEngagementGraph(engagement: FdeEngagement): Promise<void> {
  const { vertices, edges } = engagementToGraph(engagement)
  appendGraphDelta({ vertices, edges })

  try {
    const { listAllRequirements } =
      require('../fde/trainingStore') as typeof import('../fde/trainingStore')
    for (const req of listAllRequirements(500).filter((r) => r.engagementId === engagement.id)) {
      const chunk = requirementToGraph(req)
      appendGraphDelta(chunk)
    }
  } catch {
    /* optional */
  }

  await flushGraphAppend()
}

/**
 * Backfill FalkorDB from the SQLite knowledge graph.
 * Routine ingest appends via graphAppend; call this once after enabling FalkorDB or to repair drift.
 */
export async function syncGraph(): Promise<GraphSyncResult> {
  const started = Date.now()
  const { vertices, edges } = buildGraphSnapshotFromStore()
  const adapters: string[] = ['sqlite']

  const falkor = new FalkorGraphAdapter()
  if (falkor.isAvailable()) {
    try {
      await falkor.syncSnapshot(vertices, edges)
      adapters.push('falkordb')
    } catch (e) {
      console.warn('[graph/falkordb] reconcile failed:', (e as Error).message)
    }
  }

  return {
    verticesUpserted: vertices.length,
    edgesUpserted: edges.length,
    adapters,
    durationMs: Date.now() - started
  }
}

export async function graphStats(): Promise<{
  entities: number
  edges: number
  deals: number
  falkorConfigured: boolean
  falkorConnected: boolean
  falkorNodes?: number
  falkorGraphEdges?: number
}> {
  const { countEntities, countEdges } = require('../kb/store') as typeof import('../kb/store')
  let falkorConnected = false
  let falkorNodes: number | undefined
  let falkorGraphEdges: number | undefined

  if (falkorConfigured()) {
    try {
      falkorConnected = await pingFalkor()
      if (falkorConnected) {
        const counts = await falkorGraphCounts()
        if (counts) {
          falkorNodes = counts.nodes
          falkorGraphEdges = counts.edges
        }
      }
    } catch {
      falkorConnected = false
    }
  }

  return {
    entities: countEntities(),
    edges: countEdges(),
    deals: countEngagements(),
    falkorConfigured: falkorConfigured(),
    falkorConnected,
    falkorNodes,
    falkorGraphEdges
  }
}
