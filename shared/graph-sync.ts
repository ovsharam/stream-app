/**
 * Graph sync + feed ranking — adapter interface for SQLite (local) and Neptune (remote).
 */

export type GraphVertexLabel =
  | 'operator'
  | 'customer'
  | 'deal'
  | 'meeting'
  | 'requirement'
  | 'blocker'
  | 'integration'
  | 'stakeholder'
  | 'stream_item'
  | 'entity'

export interface GraphVertex {
  id: string
  label: GraphVertexLabel
  /** Display name / primary key for lexical match */
  name: string
  properties?: Record<string, unknown>
}

export interface GraphEdgeRecord {
  id: string
  fromId: string
  toId: string
  type: string
  weight?: number
}

export interface GraphSyncResult {
  verticesUpserted: number
  edgesUpserted: number
  adapters: string[]
  durationMs: number
}

export interface GraphStoreAdapter {
  readonly name: string
  isAvailable(): boolean
  upsertVertices(vertices: GraphVertex[]): number
  upsertEdges(edges: GraphEdgeRecord[]): number
}

export interface FeedRankBreakdown {
  total: number
  urgency: number
  intention: number
  graphSalience: number
  engagementPrior: number
  freshness: number
  penalty: number
}

export interface RankedFeedEventMeta {
  rankScore?: number
  rankBreakdown?: FeedRankBreakdown
}
