import type { DashboardActivity, DashboardMeetingSummary, DataDashboardSnapshot } from '../../shared/dashboard'
import { getRecentItems } from '../db'
import {
  getTrainingSummary,
  listRecentAssistPredictions,
  listRecentDecisionEvents,
  listRecentMeetingRecords,
  listRecentMeetingSignals,
  listRecentStarredMoments
} from '../fde/trainingStore'
import { countDatapoints, countEntities, countEdges, countTraces, listDatapoints } from '../kb/store'
import { graphStats } from '../graph/syncService'
import {
  countOperatorEvents,
  countOperatorEventsByType,
  listOperatorEvents
} from '../telemetry/store'
import { getEpisodeDashboardData } from '../intention/service'
import { buildDashboardInsights, engagementCount } from './insights'
import {
  datapointToActivity,
  decisionEventToActivity,
  operatorEventToActivity,
  streamItemToActivity
} from './activity'

function countStreamItems(): number {
  try {
    const mod = require('../db-sqlite') as typeof import('../db-sqlite')
    return mod.countStreamItems()
  } catch {
    return getRecentItems(10_000).length
  }
}

function meetingTitleLookup(
  meetings: DashboardMeetingSummary[]
): Map<string, string | undefined> {
  return new Map(meetings.map((m) => [m.sessionId, m.title]))
}

export async function buildDashboardSnapshot(input: {
  since?: number
  activityLimit?: number
} = {}): Promise<DataDashboardSnapshot> {
  const activityLimit = Math.min(Math.max(input.activityLimit ?? 80, 1), 200)
  const since = input.since

  const [
    fdeStats,
    graph,
    recentMeetings,
    recentStarred,
    recentSignals,
    recentPredictions,
    recentDecisions
  ] = await Promise.all([
    Promise.resolve(getTrainingSummary()),
    graphStats(),
    Promise.resolve(listRecentMeetingRecords(12)),
    Promise.resolve(listRecentStarredMoments(30)),
    Promise.resolve(listRecentMeetingSignals(30)),
    Promise.resolve(listRecentAssistPredictions(20)),
    Promise.resolve(listRecentDecisionEvents(40))
  ])

  const titleBySession = meetingTitleLookup(recentMeetings)

  const moments: DataDashboardSnapshot['moments'] = {
    starred: recentStarred.map((m) => ({
      id: m.id,
      sessionId: m.sessionId,
      text: m.text,
      reason: m.reason,
      meetingTitle: titleBySession.get(m.sessionId),
      ts: m.ts
    })),
    signals: recentSignals.map((s) => ({
      id: s.id,
      sessionId: s.sessionId,
      type: s.type,
      text: s.text,
      meetingTitle: titleBySession.get(s.sessionId),
      ts: s.ts
    })),
    predictions: recentPredictions.map((p) => ({
      id: p.id,
      sessionId: p.sessionId,
      signalText: p.signalText,
      sayThis: p.sayThis,
      flag: p.flag,
      ts: p.ts
    })),
    meetings: recentMeetings.map((m) => ({
      sessionId: m.sessionId,
      title: m.title,
      dealHint: m.dealHint,
      engagementId: m.engagementId,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      durationMs: m.durationMs,
      chunkCount: m.chunkCount,
      signalCount: m.signalCount,
      starredCount: m.starredCount
    }))
  }

  const activity: DashboardActivity[] = []

  if (since != null && Number.isFinite(since)) {
    activity.push(
      ...listOperatorEvents({ since, limit: activityLimit }).map(operatorEventToActivity),
      ...recentDecisions.filter((e) => e.ts >= since).map(decisionEventToActivity),
      ...listDatapoints(activityLimit)
        .filter((dp) => dp.ingestedAt >= since)
        .map(datapointToActivity),
      ...getRecentItems(activityLimit)
        .filter((item) => item.timestamp.getTime() >= since)
        .map(streamItemToActivity)
    )
  } else {
    activity.push(
      ...listOperatorEvents({ limit: 40 }).map(operatorEventToActivity),
      ...recentDecisions.slice(0, 20).map(decisionEventToActivity),
      ...listDatapoints(15).map(datapointToActivity),
      ...getRecentItems(15).map(streamItemToActivity)
    )
  }

  activity.sort((a, b) => b.ts - a.ts)

  const intention = getEpisodeDashboardData(50)
  const insights = buildDashboardInsights()

  return {
    generatedAt: Date.now(),
    counts: {
      streamItems: countStreamItems(),
      operatorEvents: countOperatorEvents(),
      operatorEventsByType: countOperatorEventsByType(),
      fde: fdeStats,
      kb: {
        entities: countEntities(),
        datapoints: countDatapoints(),
        edges: countEdges(),
        traces: countTraces()
      },
      graph,
      engagements: engagementCount()
    },
    moments,
    intention,
    insights,
    activity: activity.slice(0, activityLimit)
  }
}
