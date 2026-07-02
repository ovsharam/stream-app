/**
 * Product context graph — per-enterprise-customer knowledge graph of product
 * capabilities/limitations built from their docs, Slack, and internal data.
 * Powers the FDE intake scoring, build prompt generation, and requirement validation.
 */

export type ProductNodeLabel =
  | 'capability'
  | 'limitation'
  | 'integration'
  | 'pattern'
  | 'constraint'
  | 'workaround'

/**
 * The temporal/roadmap axis — FDEs operate at the edge of demand, so every
 * fact carries WHERE it sits on the product timeline:
 * - ga: shipped and generally available right now
 * - beta: exists but gated (beta / preview / early access)
 * - upcoming: confirmed on the roadmap / actively being built
 * - requested: asked for repeatedly but not committed to the roadmap
 * - not_planned: explicitly ruled out
 * - deprecated: existed, being removed or already gone
 */
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
  /** 0–1: how clearly this is stated in the source doc */
  confidence: number
  sourceDocId: string
  /** Which enterprise customer this graph belongs to */
  customerId: string
  /** Where this sits on the product timeline (default 'ga' for legacy nodes) */
  availability?: ProductAvailability
  /** Independent observations (syncs / meetings / docs) that surfaced this fact */
  mentionCount?: number
  /** Last time any source re-confirmed this fact — staleness signal for FDEs */
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
  /** Roadmap position detected by the extractor (reviewer can trust or fix) */
  availability?: ProductAvailability
  properties?: Record<string, string | number | boolean>
  status: ReviewStatus
  /** Set when user edits the name before approving */
  editedName?: string
  /** Set when user edits the description before approving */
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
