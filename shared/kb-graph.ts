/** Knowledge graph snapshot for Neo4j-style visualization. */

export type KbGraphNodeKind = 'entity' | 'datapoint'

export type KbGraphNode = {
  id: string
  kind: KbGraphNodeKind
  label: string
  /** entity kind or datapoint kind */
  type: string
  ontologyType?: string
  mentionCount?: number
  source?: string
  intention?: string
  ingestedAt?: number
  excerpt?: string
}

export type KbGraphLink = {
  id: string
  source: string
  target: string
  relation: string
  weight: number
}

export type KbGraphViewMode = 'structured' | 'memories' | 'full'

export type KbGraphSnapshot = {
  nodes: KbGraphNode[]
  links: KbGraphLink[]
  stats: {
    entities: number
    datapoints: number
    edges: number
    traces: number
    ontology: string
    /** Nodes/edges included in this snapshot (may be subset of totals). */
    viewedEntities?: number
    viewedEdges?: number
    ontologyEdges?: number
    mentionEdges?: number
  }
  generatedAt: number
}
