import type { EngagementStage, FdeEngagement } from '../../shared/fde-engagement'
import { normalizeEngagementStage } from '../../shared/fde-context'
import type { BuildExecutor } from '../../shared/build-executor'
import type { StreamItem } from '../../shared/types'
import { getEngagement, listEngagements, upsertEngagement } from './engagementStore'

function normalizeFeedItemId(id: string): string {
  return id.replace(/^ext-/, '')
}

function feedItemIdsMatch(a: string, b: string): boolean {
  return normalizeFeedItemId(a) === normalizeFeedItemId(b)
}

function promptOverlap(a: string, b: string): boolean {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (!left || !right) return false
  const slice = Math.min(80, Math.min(left.length, right.length))
  if (slice < 12) return left === right
  const headLeft = left.slice(0, slice)
  const headRight = right.slice(0, slice)
  return left.includes(headRight) || right.includes(headLeft)
}

export function resolveEngagementForBuild(input: {
  engagementId?: string
  prompt?: string
}): FdeEngagement | null {
  if (input.engagementId) {
    return getEngagement(input.engagementId)
  }

  const prompt = input.prompt?.trim()
  const engagements = listEngagements(200)

  if (prompt) {
    for (const engagement of engagements) {
      const brief = engagement.buildPrompt?.trim()
      if (brief && promptOverlap(prompt, brief)) return engagement
    }
  }

  const activeCandidates = engagements.filter(
    (e) =>
      (e.stage === 'intake' || e.stage === 'context' || e.stage === 'build') &&
      e.buildPrompt?.trim()
  )
  if (activeCandidates.length === 1) return activeCandidates[0]!

  const intakeWithBrief = engagements
    .filter((e) => e.stage === 'intake' && e.buildPrompt?.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (intakeWithBrief[0]) return intakeWithBrief[0]

  return null
}

function stageForBuild(existing: FdeEngagement): EngagementStage {
  const stage = normalizeEngagementStage(existing.stage)
  if (stage === 'deploy' || stage === 'paused') return stage
  return 'build'
}

export function attachBuildRunToEngagement(input: {
  engagementId: string
  streamItemId: string
}): FdeEngagement | null {
  const existing = getEngagement(input.engagementId)
  if (!existing) return null

  const feedItemIds = [...existing.feedItemIds]
  for (const id of [input.streamItemId, `ext-${normalizeFeedItemId(input.streamItemId)}`]) {
    if (!feedItemIds.some((existingId) => feedItemIdsMatch(existingId, id))) {
      feedItemIds.push(id)
    }
  }

  return upsertEngagement({
    id: existing.id,
    clientName: existing.clientName,
    stage: stageForBuild(existing),
    feedItemIds
  })
}

export function withEngagementMetadata(item: StreamItem, engagementId: string): StreamItem {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      engagementId
    }
  }
}

export function buildRunTrainingExecutor(executor: BuildExecutor): 'claude' | 'cursor' {
  return executor === 'claude-code' ? 'claude' : 'cursor'
}
