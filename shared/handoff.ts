import type { FdeEngagement } from './fde-engagement'

export type HandoffBrief = {
  engagementId: string
  clientName: string
  stage: FdeEngagement['stage']
  scope: FdeEngagement['scope']
  gapSummary: string
  buyerContext: string
  fdeMotion: string
  aeActions: string[]
  fdeActions: string[]
  kbExcerpts: string[]
  linkedProposals: Array<{ id: string; intent: string; senderName: string; summary: string }>
  generatedAt: number
}
