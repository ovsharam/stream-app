/**
 * Personal knowledge graph — datapoints, intention vectors, action traces.
 * Consumer-first: stream-of-consciousness + integration feed → ontology → GraphRAG context.
 */

import type { EngagementOutcome } from './operator-telemetry'

export type DatapointKind =
  | 'integration_event'
  | 'consciousness'
  | 'action'
  | 'note'
  | 'meeting_live'
  | 'mobile_cluster'

export type IntentionKind = 'explore' | 'plan' | 'execute' | 'reflect' | 'defer'

/** Weighted intention mix — velocity embedding dimension alongside semantic embedding. */
export interface IntentionVector {
  explore: number
  plan: number
  execute: number
  reflect: number
  defer: number
  dominant: IntentionKind
}

export interface KbEntity {
  id: string
  kind: 'person' | 'company' | 'term' | 'topic' | 'project' | 'concept'
  /** Ontology type id from config/kb-ontology.json — e.g. customer, requirement */
  ontologyType?: string
  label: string
  normalized: string
  createdAt: number
  updatedAt: number
  mentionCount: number
}

export interface KbEdge {
  id: string
  fromId: string
  toId: string
  /** Core edges or custom ids from ontology relationTypes */
  relation: string
  weight: number
  createdAt: number
}

export interface Datapoint {
  id: string
  kind: DatapointKind
  source: string
  sourceRef?: string
  title?: string
  body: string
  ingestedAt: number
  intention: IntentionVector
  entityIds: string[]
  embeddingHint?: string
  metadata: Record<string, unknown>
}

export interface ActionTrace {
  id: string
  datapointId?: string
  subjectType: 'stream_item' | 'compose_action' | 'consciousness'
  subjectId: string
  operatorId: string
  provider?: string
  actionKind: string
  rawCommand?: string
  seenAt: number
  startedAt: number
  completedAt: number
  timeToActionMs: number
  concurrentTraceIds: string[]
  outcome: EngagementOutcome
  intention: IntentionVector
}

export interface GraphRagChunk {
  datapointId: string
  title: string
  excerpt: string
  score: number
  intention: IntentionVector
  entityLabels: string[]
  source: string
  ingestedAt: number
}

export interface GraphRagContext {
  query: string
  chunks: GraphRagChunk[]
  relatedEntities: KbEntity[]
  recentTraces: ActionTrace[]
  intentionProfile: IntentionVector
}
