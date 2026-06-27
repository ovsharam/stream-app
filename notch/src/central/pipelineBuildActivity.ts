import type { CentralStreamEvent } from '@shared/cluster'
import type { EngagementStage, FdeEngagement } from '@shared/fde-engagement'
import { buildRunningAgents, type RunningAgent } from './homeAgents'

function normalizeStreamItemId(id: string): string {
  return id.replace(/^ext-/, '')
}

function engagementHasRunningBuild(engagement: FdeEngagement, runningIds: Set<string>): boolean {
  return engagement.feedItemIds.some((id) => runningIds.has(normalizeStreamItemId(id)))
}

export function pipelineBuildActivity(
  events: CentralStreamEvent[],
  engagements: FdeEngagement[]
): {
  runningBuilds: RunningAgent[]
  runningIds: Set<string>
  buildingEngagementIds: Set<string>
  unlinkedBuilds: RunningAgent[]
  displayStage: (engagement: FdeEngagement) => EngagementStage
} {
  const runningBuilds = buildRunningAgents({ events })
  const runningIds = new Set(runningBuilds.map((build) => normalizeStreamItemId(build.id)))

  const linkedIds = new Set<string>()
  for (const engagement of engagements) {
    for (const id of engagement.feedItemIds) {
      linkedIds.add(normalizeStreamItemId(id))
    }
  }

  const buildingEngagementIds = new Set<string>()
  for (const engagement of engagements) {
    if (engagementHasRunningBuild(engagement, runningIds)) {
      buildingEngagementIds.add(engagement.id)
    }
  }

  const unlinkedBuilds = runningBuilds.filter(
    (build) => !linkedIds.has(normalizeStreamItemId(build.id))
  )

  const displayStage = (engagement: FdeEngagement): EngagementStage => {
    if (engagement.stage === 'deploy' || engagement.stage === 'paused') {
      return engagement.stage
    }
    if (engagement.stage === 'build' || buildingEngagementIds.has(engagement.id)) {
      return 'build'
    }
    return engagement.stage
  }

  return {
    runningBuilds,
    runningIds,
    buildingEngagementIds,
    unlinkedBuilds,
    displayStage
  }
}

export function engagementsByPipelineStage(
  engagements: FdeEngagement[],
  displayStage: (engagement: FdeEngagement) => EngagementStage
): Record<EngagementStage, FdeEngagement[]> {
  const map: Record<EngagementStage, FdeEngagement[]> = {
    intake: [],
    context: [],
    build: [],
    test: [],
    deploy: [],
    paused: []
  }
  for (const engagement of engagements) {
    const stage = displayStage(engagement)
    map[stage]?.push(engagement)
  }
  for (const stage of Object.keys(map) as EngagementStage[]) {
    map[stage].sort((a, b) => b.updatedAt - a.updatedAt)
  }
  return map
}
