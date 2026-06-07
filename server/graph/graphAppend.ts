import type { GraphEdgeRecord, GraphVertex } from '../../shared/graph-sync'
import { FalkorGraphAdapter } from './adapters/falkorAdapter'
import { falkorConfigured } from './falkorClient'

type Pending = { vertices: Map<string, GraphVertex>; edges: Map<string, GraphEdgeRecord> }

let pending: Pending = { vertices: new Map(), edges: new Map() }
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null

const FLUSH_MS = 400

function stageDelta(delta: { vertices?: GraphVertex[]; edges?: GraphEdgeRecord[] }): void {
  for (const v of delta.vertices ?? []) {
    if (!v.id || !v.name?.trim()) continue
    pending.vertices.set(v.id, v)
  }
  for (const e of delta.edges ?? []) {
    if (!e.fromId || !e.toId) continue
    pending.edges.set(e.id, e)
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushGraphAppend()
  }, FLUSH_MS)
}

/** Incrementally MERGE nodes/edges into the persistent FalkorDB graph (Obsidian-style append). */
export function appendGraphDelta(delta: {
  vertices?: GraphVertex[]
  edges?: GraphEdgeRecord[]
}): void {
  if (!falkorConfigured()) return
  if ((delta.vertices?.length ?? 0) === 0 && (delta.edges?.length ?? 0) === 0) return
  stageDelta(delta)
  scheduleFlush()
}

/** Flush pending deltas immediately (e.g. after meeting ends). */
export async function flushGraphAppend(): Promise<void> {
  if (!falkorConfigured()) return
  if (flushing) return flushing
  if (pending.vertices.size === 0 && pending.edges.size === 0) return

  const batch = pending
  pending = { vertices: new Map(), edges: new Map() }

  flushing = (async () => {
    const falkor = new FalkorGraphAdapter()
    const vertices = [...batch.vertices.values()]
    const edges = [...batch.edges.values()]
    if (vertices.length) await falkor.upsertVertices(vertices)
    if (edges.length) await falkor.upsertEdges(edges)
  })()
    .catch((e) => {
      console.warn('[graph/falkordb] append failed:', (e as Error).message)
    })
    .finally(() => {
      flushing = null
    })

  return flushing
}
