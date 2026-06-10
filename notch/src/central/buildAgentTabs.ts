import type { CentralStreamEvent } from '@shared/cluster'
import type { BuildExecutor } from '@shared/build-executor'
import {
  buildEventItemId,
  buildEventPrompt,
  buildEventStartedAt,
  buildExecutorFromEvent,
  buildRunStatus,
  isBuildStreamEvent,
  type BuildRunStatus
} from '@shared/build-dojo'

export type BuildPane = 'chat' | 'agent'

export type BuildAgentTab = {
  id: string
  title: string
  executor: BuildExecutor | 'unknown'
  status: BuildRunStatus
  startedAt: number
}

export function agentTabFromEvent(event: CentralStreamEvent): BuildAgentTab {
  const prompt = buildEventPrompt(event)
  return {
    id: buildEventItemId(event),
    title: prompt.length > 72 ? `${prompt.slice(0, 71)}…` : prompt,
    executor: buildExecutorFromEvent(event) ?? 'unknown',
    status: buildRunStatus(event),
    startedAt: buildEventStartedAt(event)
  }
}

export function resolveBuildAgentTabs(
  events: CentralStreamEvent[],
  openIds: string[]
): BuildAgentTab[] {
  const byId = new Map<string, BuildAgentTab>()
  for (const event of events.filter(isBuildStreamEvent)) {
    const tab = agentTabFromEvent(event)
    byId.set(tab.id, tab)
  }

  return openIds.map((id) => {
    const hit = byId.get(id)
    if (hit) return hit
    return {
      id,
      title: `Build ${id.slice(-6)}`,
      executor: 'unknown' as const,
      status: 'done' as BuildRunStatus,
      startedAt: Date.now()
    }
  })
}

export function runningBuildIds(events: CentralStreamEvent[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const event of events.filter(isBuildStreamEvent)) {
    if (buildRunStatus(event) !== 'running') continue
    const id = buildEventItemId(event)
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function executorShort(executor: BuildExecutor | 'unknown'): string {
  switch (executor) {
    case 'claude-code':
      return 'CC'
    case 'cursor-local':
      return 'Cu'
    case 'cursor-cloud':
      return '☁'
    default:
      return '◆'
  }
}
