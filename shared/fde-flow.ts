/** FDE intake → deploy flow (live demo + API). */

export type FlowStageId = 'extract' | 'score' | 'build' | 'execute' | 'email' | 'apply'

export type FlowRequirement = {
  text: string
  status: 'open' | 'confirmed' | 'ambiguous'
}

export type FlowExtracted = {
  client: string
  title: string
  requirements: FlowRequirement[]
}

export type FlowScore = {
  contextScore: number
  gaps: string[]
  needsAeSync: boolean
  reasoning: string
}

export type FlowBuildPlan = {
  steps: { order: number; action: string; gotcha?: string }[]
  summary: string
  blockedNote?: string
}

export type FlowExecute = {
  filesWritten: string[]
  log: string[]
}

export type FlowEmail = {
  subject: string
  body: string
}

export type FlowStageEvent =
  | { stage: FlowStageId; status: 'running' }
  | { stage: FlowStageId; status: 'done'; ms: number; output: unknown }
  | { stage: 'complete'; engagementId: string; email: FlowEmail; filesWritten: string[]; totalMs: number }
  | { stage: 'error'; message: string }

export const FLOW_STAGE_LABELS: Record<Exclude<FlowStageId, 'apply'>, string> = {
  extract: 'Extract requirements',
  score: 'Context & gap analysis',
  build: 'Build plan',
  execute: 'Generate code',
  email: 'Client email'
}
