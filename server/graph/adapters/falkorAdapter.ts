import type { GraphEdgeRecord, GraphVertex } from '../../../shared/graph-sync'
import { getFalkorGraph, falkorConfigured } from '../falkorClient'

const CHUNK = 80

const NODE_LABEL: Record<GraphVertex['label'], string> = {
  operator: 'Operator',
  customer: 'Customer',
  deal: 'Deal',
  meeting: 'Meeting',
  requirement: 'Requirement',
  blocker: 'Blocker',
  integration: 'Integration',
  stakeholder: 'Stakeholder',
  stream_item: 'StreamItem',
  entity: 'Entity'
}

function cypherLabel(label: GraphVertex['label']): string {
  return NODE_LABEL[label] ?? 'Entity'
}

function cypherRelType(type: string): string {
  const t = type.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()
  return t || 'RELATED'
}

function flatProps(obj?: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v
    } else {
      out[k] = JSON.stringify(v)
    }
  }
  return out
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export class FalkorGraphAdapter {
  readonly name = 'falkordb'

  isAvailable(): boolean {
    return falkorConfigured()
  }

  async upsertVertices(vertices: GraphVertex[]): Promise<number> {
    if (!this.isAvailable() || vertices.length === 0) return 0
    const graph = await getFalkorGraph()
    let n = 0

    const byLabel = new Map<string, GraphVertex[]>()
    for (const v of vertices) {
      const label = cypherLabel(v.label)
      const list = byLabel.get(label) ?? []
      list.push(v)
      byLabel.set(label, list)
    }

    for (const [label, group] of byLabel) {
      for (const batch of chunk(group, CHUNK)) {
        const rows = batch.map((v) => ({
          id: v.id,
          name: v.name,
          notchLabel: v.label,
          props: flatProps(v.properties)
        }))
        await graph.query(
          `UNWIND $rows AS row
           MERGE (n:${label} {id: row.id})
           SET n.name = row.name, n.notchLabel = row.notchLabel
           SET n += row.props`,
          { params: { rows } }
        )
        n += batch.length
      }
    }
    return n
  }

  async upsertEdges(edges: GraphEdgeRecord[]): Promise<number> {
    if (!this.isAvailable() || edges.length === 0) return 0
    const graph = await getFalkorGraph()
    let n = 0

    const byType = new Map<string, GraphEdgeRecord[]>()
    for (const e of edges) {
      const rel = cypherRelType(e.type)
      const list = byType.get(rel) ?? []
      list.push(e)
      byType.set(rel, list)
    }

    for (const [relType, group] of byType) {
      for (const batch of chunk(group, CHUNK)) {
        const rows = batch.map((e) => ({
          fromId: e.fromId,
          toId: e.toId,
          weight: e.weight ?? 1,
          edgeId: e.id
        }))
        await graph.query(
          `UNWIND $rows AS row
           MATCH (a {id: row.fromId}), (b {id: row.toId})
           MERGE (a)-[r:${relType}]->(b)
           SET r.weight = row.weight, r.edgeId = row.edgeId`,
          { params: { rows } }
        )
        n += batch.length
      }
    }
    return n
  }

  async syncSnapshot(
    vertices: GraphVertex[],
    edges: GraphEdgeRecord[]
  ): Promise<{ vertices: number; edges: number }> {
    const v = await this.upsertVertices(vertices)
    const e = await this.upsertEdges(edges)
    return { vertices: v, edges: e }
  }
}
