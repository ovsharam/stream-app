import type { Datapoint, KbEntity } from '../../shared/personal-kb'
import type { GraphEdgeRecord, GraphVertex, GraphVertexLabel } from '../../shared/graph-sync'
import type { FdeEngagement } from '../../shared/fde-engagement'

const ONTOLOGY_LABELS = new Set<GraphVertexLabel>([
  'operator',
  'customer',
  'deal',
  'meeting',
  'requirement',
  'blocker',
  'integration',
  'stakeholder',
  'stream_item',
  'entity'
])

export function entityToVertex(e: KbEntity): GraphVertex {
  const label: GraphVertexLabel =
    e.ontologyType && ONTOLOGY_LABELS.has(e.ontologyType as GraphVertexLabel)
      ? (e.ontologyType as GraphVertexLabel)
      : 'entity'
  return {
    id: e.id,
    label,
    name: e.label,
    properties: { kind: e.kind, mentionCount: e.mentionCount, ontologyType: e.ontologyType }
  }
}

export function datapointToVertex(dp: Datapoint): GraphVertex {
  return {
    id: dp.id,
    label: 'stream_item',
    name: (dp.title ?? dp.source).slice(0, 200),
    properties: {
      source: dp.source,
      kind: dp.kind,
      ingestedAt: dp.ingestedAt,
      sourceRef: dp.sourceRef
    }
  }
}

export function makeGraphEdge(
  fromId: string,
  toId: string,
  type: string,
  weight = 1
): GraphEdgeRecord {
  return {
    id: `edge-${fromId}-${type}-${toId}`,
    fromId,
    toId,
    type,
    weight
  }
}

export function engagementToGraph(eng: FdeEngagement): {
  vertices: GraphVertex[]
  edges: GraphEdgeRecord[]
} {
  const vertices: GraphVertex[] = []
  const edges: GraphEdgeRecord[] = []
  const dealId = `gv-deal-${eng.id}`

  vertices.push({
    id: dealId,
    label: 'deal',
    name: eng.clientName,
    properties: {
      engagementId: eng.id,
      company: eng.company,
      stage: eng.stage,
      scope: eng.scope,
      escalationLevel: eng.escalationLevel
    }
  })

  if (eng.company) {
    const customerId = `gv-customer-${eng.company.toLowerCase().replace(/\s+/g, '-')}`
    vertices.push({
      id: customerId,
      label: 'customer',
      name: eng.company,
      properties: { company: eng.company }
    })
    edges.push(makeGraphEdge(dealId, customerId, 'part_of_customer', 1))
  }

  for (const sessionId of eng.meetingIds) {
    const mid = `gv-meeting-${sessionId}`
    vertices.push({
      id: mid,
      label: 'meeting',
      name: eng.clientName,
      properties: { sessionId, engagementId: eng.id }
    })
    edges.push(makeGraphEdge(mid, dealId, 'part_of_deal', 1))
  }

  return { vertices, edges }
}

export function requirementToGraph(input: {
  id: string
  engagementId: string
  sessionId?: string
  field: string
  value: string
  status: string
}): { vertices: GraphVertex[]; edges: GraphEdgeRecord[] } {
  const rid = `gv-req-${input.id}`
  const dealId = `gv-deal-${input.engagementId}`
  const label: GraphVertexLabel = input.field === 'risk' ? 'blocker' : 'requirement'

  const vertices: GraphVertex[] = [
    {
      id: rid,
      label,
      name: input.value.slice(0, 120),
      properties: { field: input.field, status: input.status, fullValue: input.value }
    }
  ]
  const edges: GraphEdgeRecord[] = [
    makeGraphEdge(dealId, rid, 'has_requirement', input.status === 'open' ? 1.2 : 0.8)
  ]

  if (input.sessionId) {
    const mid = `gv-meeting-${input.sessionId}`
    edges.push(makeGraphEdge(rid, mid, 'extracted_from', 1))
  }

  return { vertices, edges }
}
