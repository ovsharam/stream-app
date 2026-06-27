import type { EngagementStage, FdeEngagement } from './fde-engagement'

export const CONTEXT_GATE = 60

export function normalizeEngagementStage(stage: string): EngagementStage {
  if (stage === 'maintenance') return 'deploy'
  if (
    stage === 'intake' ||
    stage === 'context' ||
    stage === 'build' ||
    stage === 'test' ||
    stage === 'deploy' ||
    stage === 'paused'
  ) {
    return stage
  }
  return 'intake'
}

export function computeContextScore(engagement: FdeEngagement): number {
  let score = 0

  if (engagement.summary?.trim()) score += 20
  if (engagement.buildPrompt?.trim()) score += 25

  const openQuestions = engagement.openQuestions.length
  if (openQuestions === 0) score += 15
  else if (openQuestions <= 2) score += 8

  const flags = engagement.flags.length
  if (flags === 0) score += 10
  else if (flags <= 2) score += 5

  if (engagement.scope !== 'unknown') score += 20
  else score -= 10

  if (engagement.escalationLevel >= 2) score -= 15
  else if (engagement.escalationLevel === 1) score -= 5

  return Math.max(0, Math.min(100, score))
}

export function canAdvanceFromContext(score: number): boolean {
  return score >= CONTEXT_GATE
}
