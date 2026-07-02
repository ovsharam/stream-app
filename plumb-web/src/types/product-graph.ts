export type ProductNodeLabel =
  | 'capability'
  | 'limitation'
  | 'integration'
  | 'pattern'
  | 'constraint'
  | 'workaround'

/** Temporal/roadmap axis: where a fact sits on the product timeline. */
export type ProductAvailability =
  | 'ga'
  | 'beta'
  | 'upcoming'
  | 'requested'
  | 'not_planned'
  | 'deprecated'

export type ProductEdgeType =
  | 'REQUIRES'
  | 'BLOCKS'
  | 'WORKAROUND_FOR'
  | 'ENABLES'
  | 'CONFLICTS_WITH'
  | 'INSTANCE_OF'
  | 'RELATED'

export interface ProductNode {
  id: string
  label: ProductNodeLabel
  name: string
  description: string
  confidence: number
  sourceDocId: string
  customerId: string
  availability?: ProductAvailability
  mentionCount?: number
  lastConfirmedAt?: number
  properties?: Record<string, string | number | boolean>
}

export interface ProductEdge {
  id: string
  fromId: string
  toId: string
  type: ProductEdgeType
  weight?: number
  customerId: string
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected'

export interface ReviewQueueItem {
  id: string
  customerId: string
  jobId: string
  label: ProductNodeLabel
  name: string
  description: string
  confidence: number
  sourceDocId: string
  availability?: ProductAvailability
  properties?: Record<string, string | number | boolean>
  status: ReviewStatus
  editedName?: string
  editedDescription?: string
  createdAt: number
  reviewedAt?: number
}

export type IngestJobStatus =
  | 'pending'
  | 'chunking'
  | 'extracting'
  | 'review'
  | 'writing'
  | 'done'
  | 'error'

export interface IngestJob {
  id: string
  customerId: string
  fileName: string
  mimeType: string
  status: IngestJobStatus
  chunkCount?: number
  nodeCount?: number
  errorMsg?: string
  createdAt: number
  updatedAt: number
}

export interface ProductGraphQueryResult {
  capabilities: ProductNode[]
  limitations: ProductNode[]
  integrations: ProductNode[]
  patterns: ProductNode[]
  constraints: ProductNode[]
  workarounds: ProductNode[]
  relevantEdges: ProductEdge[]
}

export interface ProductGraphStats {
  customerId: string
  totalNodes: number
  byLabel: Record<ProductNodeLabel, number>
  totalEdges: number
  lastUpdated?: number
}
