import { randomUUID } from 'crypto'
import { getFalkorGraph, falkorConfigured } from '../graph/falkorClient'
import type { ReviewQueueItem } from '../../shared/product-graph'
import type { ProductNode, ProductEdge } from '../../shared/product-graph'
import {
  getApprovedItems,
  upsertProductNode,
  upsertProductEdge,
  updateJobStatus
} from './ingestStore'

// Product graph uses its own Cypher labels (separate namespace from the FDE graph)
const LABEL_MAP: Record<string, string> = {
  capability: 'ProductCapability',
  limitation: 'ProductLimitation',
  integration: 'ProductIntegration',
  pattern: 'ProductPattern',
  constraint: 'ProductConstraint',
  workaround: 'ProductWorkaround'
}

async function writeNodeToFalkor(node: ProductNode): Promise<void> {
  if (!falkorConfigured()) return
  const graph = await getFalkorGraph()
  const label = LABEL_MAP[node.label] ?? 'ProductNode'
  await graph.query(
    `MERGE (n:${label} {id: $id})
     SET n.name = $name,
         n.description = $description,
         n.confidence = $confidence,
         n.customerId = $customerId,
         n.sourceDocId = $sourceDocId,
         n.label = $label`,
    {
      params: {
        id: node.id,
        name: node.name,
        description: node.description,
        confidence: node.confidence,
        customerId: node.customerId,
        sourceDocId: node.sourceDocId,
        label: node.label
      }
    }
  )
}

async function writeEdgeToFalkor(edge: ProductEdge): Promise<void> {
  if (!falkorConfigured()) return
  const graph = await getFalkorGraph()
  const relType = edge.type.replace(/[^A-Z0-9_]/g, '_')
  await graph.query(
    `MATCH (a {id: $fromId}), (b {id: $toId})
     MERGE (a)-[r:${relType}]->(b)
     SET r.weight = $weight, r.customerId = $customerId`,
    { params: { fromId: edge.fromId, toId: edge.toId, weight: edge.weight ?? 1, customerId: edge.customerId } }
  )
}

/** Infer semantic edges between a set of product nodes */
function inferEdges(nodes: ProductNode[]): ProductEdge[] {
  const edges: ProductEdge[] = []
  const limitations = nodes.filter((n) => n.label === 'limitation')
  const workarounds = nodes.filter((n) => n.label === 'workaround')
  const capabilities = nodes.filter((n) => n.label === 'capability')

  // Workarounds link to limitations by text overlap
  for (const wa of workarounds) {
    for (const lim of limitations) {
      if (textOverlap(wa.description, lim.name) || textOverlap(wa.description, lim.description)) {
        edges.push({
          id: randomUUID(),
          fromId: wa.id,
          toId: lim.id,
          type: 'WORKAROUND_FOR',
          weight: 0.8,
          customerId: wa.customerId
        })
      }
    }
  }

  // Limitations block related capabilities
  for (const lim of limitations) {
    for (const cap of capabilities) {
      if (textOverlap(lim.description, cap.name) || textOverlap(lim.name, cap.name)) {
        edges.push({
          id: randomUUID(),
          fromId: lim.id,
          toId: cap.id,
          type: 'BLOCKS',
          weight: 0.7,
          customerId: lim.customerId
        })
        break  // one BLOCKS per limitation is enough
      }
    }
  }

  return edges
}

function textOverlap(a: string, b: string): boolean {
  const aWords = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
  const bWords = b.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  const matches = bWords.filter((w) => aWords.has(w))
  return matches.length >= 2
}

/** Write all approved review items from a job to SQLite + FalkorDB */
export async function writeApprovedNodes(jobId: string, customerId: string): Promise<{ nodes: number; edges: number }> {
  const approved = getApprovedItems(jobId)
  if (approved.length === 0) return { nodes: 0, edges: 0 }

  updateJobStatus(jobId, 'writing')

  const candidates: ProductNode[] = approved.map((item: ReviewQueueItem) => ({
    id: randomUUID(),
    label: item.label,
    name: item.editedName ?? item.name,
    description: item.editedDescription ?? item.description,
    confidence: item.confidence,
    sourceDocId: item.sourceDocId,
    customerId
  }))

  // Write to SQLite — upsertProductNode deduplicates by (customer_id, name) and returns the canonical node.
  // Track which IDs are genuinely new so we only write those to FalkorDB.
  const newIds = new Set(candidates.map((n) => n.id))
  const nodes: ProductNode[] = []
  for (const candidate of candidates) {
    const canonical = upsertProductNode(candidate)
    nodes.push(canonical)
  }
  const newNodes = nodes.filter((n) => newIds.has(n.id))

  // Infer edges from canonical node set (deduplicated)
  const edges = inferEdges(nodes)
  for (const edge of edges) {
    upsertProductEdge(edge)
  }

  // Write to FalkorDB (best-effort — non-blocking, only genuinely new nodes)
  if (falkorConfigured()) {
    Promise.all([
      ...newNodes.map((n) => writeNodeToFalkor(n).catch((e) => console.warn('[product-graph] falkor node write:', e.message))),
      ...edges.map((e) => writeEdgeToFalkor(e).catch((e2) => console.warn('[product-graph] falkor edge write:', e2.message)))
    ]).then(() => console.log(`[product-graph] wrote ${newNodes.length} nodes (${candidates.length - newNodes.length} deduped), ${edges.length} edges to FalkorDB`))
  }

  updateJobStatus(jobId, 'done', { nodeCount: nodes.length })
  return { nodes: nodes.length, edges: edges.length }
}
