import type { GraphEdgeRecord, GraphStoreAdapter, GraphVertex } from '../../../shared/graph-sync'

/**
 * Neptune property-graph adapter (Gremlin / openCypher).
 * Stub until NEPTUNE_ENDPOINT is configured — same interface as SQLite adapter.
 */
export class NeptuneGraphAdapter implements GraphStoreAdapter {
  readonly name = 'neptune'

  isAvailable(): boolean {
    return Boolean(process.env.NEPTUNE_ENDPOINT?.trim())
  }

  upsertVertices(vertices: GraphVertex[]): number {
    if (!this.isAvailable() || vertices.length === 0) return 0
    // TODO: batch upsert via Gremlin — g.V(id).fold().coalesce(unfold(), addV(label).property(...))
    console.info(`[graph/neptune] would upsert ${vertices.length} vertices (stub)`)
    return vertices.length
  }

  upsertEdges(edges: GraphEdgeRecord[]): number {
    if (!this.isAvailable() || edges.length === 0) return 0
    console.info(`[graph/neptune] would upsert ${edges.length} edges (stub)`)
    return edges.length
  }
}
