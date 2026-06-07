import type { OperatorEvent } from '../../shared/operator-events'
import type { IntentionEpisode } from '../../shared/intention-episode'
import { formatEpisodeChain } from '../../shared/intention-episode'
import type { DashboardActivity } from '../../shared/dashboard'
import type {
  FdeAssistPrediction,
  FdeDecisionEvent,
  FdeMeetingRecord,
  FdeMeetingSignal,
  FdeStarredMoment
} from '../../shared/fde-training'
import type { Datapoint } from '../../shared/personal-kb'
import type { StreamItem } from '../../shared/types'

function clip(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function operatorEventToActivity(event: OperatorEvent): DashboardActivity {
  const payload = event.payload ?? {}
  const source = payload.source != null ? String(payload.source) : undefined
  const detailParts = [source, event.surface, event.subjectType].filter(Boolean)
  return {
    id: event.id,
    kind: 'operator_event',
    ts: event.ts,
    title: event.type.replace(/_/g, ' '),
    detail: detailParts.length ? detailParts.join(' · ') : undefined,
    meta: {
      type: event.type,
      source,
      subjectType: event.subjectType,
      subjectId: event.subjectId,
      operatorId: event.operatorId
    }
  }
}

export function starredMomentToActivity(
  moment: FdeStarredMoment,
  meetingTitle?: string
): DashboardActivity {
  return {
    id: moment.id,
    kind: 'starred_moment',
    ts: moment.ts,
    title: 'Starred moment',
    detail: clip(moment.text),
    meta: {
      sessionId: moment.sessionId,
      reason: moment.reason,
      meetingTitle
    }
  }
}

export function meetingSignalToActivity(
  signal: FdeMeetingSignal,
  meetingTitle?: string
): DashboardActivity {
  return {
    id: signal.id,
    kind: 'meeting_signal',
    ts: signal.ts,
    title: `Signal · ${signal.type}`,
    detail: clip(signal.text),
    meta: { sessionId: signal.sessionId, meetingTitle }
  }
}

export function assistPredictionToActivity(prediction: FdeAssistPrediction): DashboardActivity {
  return {
    id: prediction.id,
    kind: 'assist_prediction',
    ts: prediction.ts,
    title: 'Assist prediction',
    detail: clip(prediction.sayThis),
    meta: { sessionId: prediction.sessionId, flag: prediction.flag }
  }
}

export function meetingEndedToActivity(record: FdeMeetingRecord): DashboardActivity {
  return {
    id: `meeting-end-${record.sessionId}`,
    kind: 'meeting_ended',
    ts: record.endedAt ?? record.createdAt,
    title: record.title ? `Meeting ended · ${record.title}` : 'Meeting ended',
    detail: [
      record.durationMs != null ? `${Math.round(record.durationMs / 60000)}m` : undefined,
      `${record.starredCount} starred`,
      `${record.signalCount} signals`
    ]
      .filter(Boolean)
      .join(' · '),
    meta: {
      sessionId: record.sessionId,
      engagementId: record.engagementId,
      chunkCount: record.chunkCount
    }
  }
}

export function decisionEventToActivity(event: FdeDecisionEvent): DashboardActivity {
  return {
    id: event.id,
    kind: 'decision_event',
    ts: event.ts,
    title: event.type.replace(/_/g, ' '),
    detail: event.humanAction ?? event.autoSuggestion ?? event.phase,
    meta: {
      phase: event.phase,
      sessionId: event.sessionId,
      engagementId: event.engagementId
    }
  }
}

export function datapointToActivity(dp: Datapoint): DashboardActivity {
  return {
    id: dp.id,
    kind: 'kb_datapoint',
    ts: dp.ingestedAt,
    title: `KB ingest · ${dp.source}`,
    detail: clip(dp.title ?? dp.body),
    meta: { kind: dp.kind, intention: dp.intention.dominant }
  }
}

export function streamItemToActivity(item: StreamItem): DashboardActivity {
  return {
    id: item.id,
    kind: 'stream_item',
    ts: item.timestamp.getTime(),
    title: `${item.source} · ${item.sender.name}`,
    detail: clip(item.title ?? item.body),
    meta: { source: item.source }
  }
}

export function episodeToActivity(episode: IntentionEpisode): DashboardActivity {
  const chain = formatEpisodeChain(episode.eventChain)
  const latency =
    episode.latencies.reactionMs != null
      ? `${Math.round(episode.latencies.reactionMs / 1000)}s react`
      : undefined
  return {
    id: episode.id,
    kind: 'intention_episode',
    ts: episode.endedAt ?? episode.startedAt,
    title: `Intention · ${episode.outcome ?? 'open'} · weight ${episode.behavioralWeight.toFixed(2)}`,
    detail: [episode.stimulusSource, episode.stimulusLabel, chain, latency].filter(Boolean).join(' · '),
    meta: {
      episodeId: episode.id,
      outcome: episode.outcome,
      depth: episode.commitmentDepth,
      weight: episode.behavioralWeight,
      dominantIntention: episode.dominantIntention,
      reactionTier: episode.reactionTier,
      chain: episode.eventChain
    }
  }
}
