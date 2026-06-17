/**
 * FDE client engagement — intake → build → maintenance across many agency clients.
 */

export type EngagementStage = 'intake' | 'build' | 'maintenance' | 'paused'

export type ScopeBucket = 'quick_win' | 'big_bet' | 'unknown'

/** 0 = normal · 1 = needs attention · 2 = escalated to lead/AE */
export type EscalationLevel = 0 | 1 | 2

export interface FdeEngagement {
  id: string
  clientName: string
  company?: string
  stage: EngagementStage
  scope: ScopeBucket
  summary?: string
  buildPrompt?: string
  nextSteps: string[]
  flags: string[]
  openQuestions: string[]
  meetingIds: string[]
  feedItemIds: string[]
  /** Linked agent proposals (LinkedIn queue, etc.). */
  proposalIds?: string[]
  /** Inbound channels feeding this deal. */
  signalSources?: ('linkedin' | 'gmail' | 'meeting' | 'monday' | 'slack')[]
  googleDocUrl?: string
  escalationLevel: EscalationLevel
  createdAt: number
  updatedAt: number
}

export interface CustomMcpAgent {
  id: string
  name: string
  description?: string
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  /** Compose alias without @ — e.g. "deploy" → @deploy ask: … */
  composeAlias?: string
  enabled: boolean
  createdAt: number
}
