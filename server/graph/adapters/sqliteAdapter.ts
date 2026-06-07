import type { GraphEdgeRecord, GraphStoreAdapter, GraphVertex } from '../../../shared/graph-sync'
import { linkEntities, upsertGraphEntity, upsertEntity } from '../../kb/store'

const LABEL_TO_KIND: Record<
  GraphVertex['label'],
  'person' | 'company' | 'term' | 'topic' | 'project' | 'concept'
> = {
  operator: 'person',
  customer: 'company',
  deal: 'project',
  meeting: 'project',
  requirement: 'concept',
  blocker: 'concept',
  integration: 'topic',
  stakeholder: 'person',
  stream_item: 'topic',
  entity: 'concept'
}

const LABEL_TO_ONTOLOGY: Partial<Record<GraphVertex['label'], string>> = {
  customer: 'customer',
  deal: 'deal',
  meeting: 'meeting',
  requirement: 'requirement',
  blocker: 'blocker',
  integration: 'integration',
  stakeholder: 'stakeholder'
}

/** Local graph store — maps to kb_entities + kb_edges. */
export class SqliteGraphAdapter implements GraphStoreAdapter {
  readonly name = 'sqlite'

  isAvailable(): boolean {
    return true
  }

  upsertVertices(vertices: GraphVertex[]): number {
    let n = 0
    for (const v of vertices) {
      if (!v.name.trim()) continue
      if (v.id.startsWith('gv-') || v.id.startsWith('ent-')) {
        upsertGraphEntity({
          id: v.id,
          kind: LABEL_TO_KIND[v.label] ?? 'concept',
          label: v.name.trim(),
          ontologyType: LABEL_TO_ONTOLOGY[v.label]
        })
      } else {
        upsertEntity({
          kind: LABEL_TO_KIND[v.label] ?? 'concept',
          label: v.name.trim(),
          ontologyType: LABEL_TO_ONTOLOGY[v.label]
        })
      }
      n += 1
    }
    return n
  }

  upsertEdges(edges: GraphEdgeRecord[]): number {
    let n = 0
    for (const e of edges) {
      linkEntities(e.fromId, e.toId, e.type, e.weight ?? 1)
      n += 1
    }
    return n
  }
}
