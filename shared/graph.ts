/**
 * Knowledge graph schema — cases, signals, entities, edges.
 * Everything ingested from MCP/connectors links here.
 */

export type SignalType =
  | 'pain_point'
  | 'blocker'
  | 'budget'
  | 'person'
  | 'champion'
  | 'timeline'
  | 'motion'
  | 'compliance'
  | 'technical'
  | 'competitor'

export type DealStage =
  | 'inbound'
  | 'qualification'
  | 'discovery'
  | 'technical_eval'
  | 'pilot'
  | 'negotiation'
  | 'closed_won'
  | 'closed_lost'

export type BetSize = 'quick_win' | 'big_bet' | 'unknown'

export type GraphSource =
  | 'gong'
  | 'salesforce'
  | 'slack'
  | 'gmail'
  | 'notion'
  | 'drive'
  | 'calendar'
  | 'zoom'
  | 'claude'
  | 'local'

export interface Case {
  id: string
  name: string
  company: string
  stage: DealStage
  betSize: BetSize
  healthScore: number // 0-100 from signal coverage
  ownerId: string
  amount?: number
  closeDate?: string
  updatedAt: Date
  metadata: Record<string, unknown>
}

export interface Signal {
  id: string
  caseId: string
  type: SignalType
  /** The extracted "word" or phrase that matters */
  token: string
  excerpt: string
  source: GraphSource
  sourceRef?: string
  confidence: number
  extractedAt: Date
  /** Cross-case pattern id if matched */
  patternId?: string
  metadata: Record<string, unknown>
}

export interface Entity {
  id: string
  kind: 'person' | 'company' | 'term' | 'product' | 'amount' | 'date'
  label: string
  normalized?: string
}

export interface GraphEdge {
  id: string
  fromId: string
  fromKind: 'signal' | 'entity' | 'case'
  toId: string
  toKind: 'signal' | 'entity' | 'case'
  relation: 'mentions' | 'blocks' | 'relates_to' | 'same_as' | 'resolved_by'
  weight: number
}

export interface CrossCasePattern {
  id: string
  token: string
  signalType: SignalType
  caseCount: number
  caseIds: string[]
  resolution?: string
  resolvedInCaseIds?: string[]
}

export interface SearchScope {
  caseId?: string
  caseName?: string
  chips: string[]
  entityIds: string[]
  signalIds: string[]
}

export interface GraphSearchResult {
  kind: 'case' | 'signal' | 'entity' | 'pattern' | 'action'
  id: string
  title: string
  subtitle: string
  caseId?: string
  source?: GraphSource
  signalType?: SignalType
  score: number
}

export interface ActiveContext {
  activeCase: Case | null
  scope: SearchScope
  recentSignals: Signal[]
  patterns: CrossCasePattern[]
  prepPoints: string[]
}

export const SIGNAL_COLORS: Record<SignalType, string> = {
  pain_point: '#EF4444',
  blocker: '#F59E0B',
  budget: '#22C55E',
  person: '#A855F7',
  champion: '#8B5CF6',
  timeline: '#EC4899',
  motion: '#3B82F6',
  compliance: '#F97316',
  technical: '#06B6D4',
  competitor: '#64748B'
}

export const SIGNAL_LABELS: Record<SignalType, string> = {
  pain_point: 'Pain',
  blocker: 'Blocker',
  budget: 'Budget',
  person: 'Person',
  champion: 'Champion',
  timeline: 'Timeline',
  motion: 'Motion',
  compliance: 'Compliance',
  technical: 'Technical',
  competitor: 'Competitor'
}
