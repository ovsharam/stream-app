import type { IntentionEpisode } from '../../shared/intention-episode'
import type { OperatorEvent } from '../../shared/operator-events'
import { emitDashboardEpisode } from '../dashboard/broadcast'
import { exportOperatorEventsForTraining } from '../telemetry/store'
import { EpisodeEngine, episodeEngine } from './episodeEngine'
import {
  clearAllEpisodes,
  clearEpisodeMeta,
  computeEpisodeStats,
  countEpisodes,
  getEpisodeMeta,
  initIntentionEpisodeStore,
  listOpenEpisodes,
  listRecentEpisodes,
  setEpisodeMeta,
  upsertEpisode
} from './episodeStore'

const EPISODE_ENGINE_VERSION = '2'
const HISTORY_BACKFILL_META = 'history_backfill_at'
let backfillInFlight = false

function queueEpisodeSupabaseSync(episodes: IntentionEpisode[]): void {
  if (episodes.length === 0) return
  void import('../supabase/sync')
    .then(({ syncIntentionEpisodesToSupabase, isSupabaseConfigured }) => {
      if (!isSupabaseConfigured()) return
      return syncIntentionEpisodesToSupabase(episodes)
    })
    .catch((err) => {
      console.warn('[supabase] intention episode sync failed:', err instanceof Error ? err.message : err)
    })
}

export function initIntentionEpisodes(): void {
  initIntentionEpisodeStore()
  const storedVersion = getEpisodeMeta('engine_version')
  if (storedVersion !== EPISODE_ENGINE_VERSION) {
    clearAllEpisodes()
    clearEpisodeMeta(HISTORY_BACKFILL_META)
    setEpisodeMeta('engine_version', EPISODE_ENGINE_VERSION)
    console.log('[intention] rebuilt episode store (engine v2)')
  }
  episodeEngine.loadOpen(listOpenEpisodes())
  if (countEpisodes() === 0 && getEpisodeMeta(HISTORY_BACKFILL_META) == null) {
    void backfillEpisodesFromHistory()
  }
}

export function processOperatorEventsForEpisodes(events: OperatorEvent[]): void {
  if (events.length === 0) return
  const sorted = [...events].sort((a, b) => a.ts - b.ts)
  for (const event of sorted) {
    const closed = episodeEngine.processOne(event, { live: true })
    if (closed) {
      upsertEpisode(closed)
      emitDashboardEpisode(closed)
      queueEpisodeSupabaseSync([closed])
    }
  }
  const openEpisodes = episodeEngine.getOpenEpisodes()
  for (const open of openEpisodes) {
    upsertEpisode(open)
  }
  if (openEpisodes.length > 0) {
    queueEpisodeSupabaseSync(openEpisodes)
  }
}

export async function backfillEpisodesFromHistory(): Promise<number> {
  if (backfillInFlight || getEpisodeMeta(HISTORY_BACKFILL_META) != null) return 0
  backfillInFlight = true
  try {
    const events = exportOperatorEventsForTraining()
    if (events.length === 0) {
      setEpisodeMeta(HISTORY_BACKFILL_META, String(Date.now()))
      return 0
    }

    const engine = new EpisodeEngine()
    const closed = engine.processEvents(events, { historical: true })
    for (const ep of closed) {
      upsertEpisode(ep)
    }
    episodeEngine.loadOpen(listOpenEpisodes())
    setEpisodeMeta(HISTORY_BACKFILL_META, String(Date.now()))
    queueEpisodeSupabaseSync(closed)
    console.log(`[intention] backfilled ${closed.length} episodes from ${events.length} operator events`)
    return closed.length
  } finally {
    backfillInFlight = false
  }
}

export function recordEpisode(episode: IntentionEpisode): IntentionEpisode {
  upsertEpisode(episode)
  emitDashboardEpisode(episode)
  queueEpisodeSupabaseSync([episode])
  return episode
}

export function recordMeetingSignalEpisode(input: {
  sessionId: string
  signalId: string
  signalType: string
  text: string
  ts: number
  meetingTitle?: string
}): IntentionEpisode {
  const episode = episodeEngine.recordDirect({
    operatorId: process.env.STREAM_OPERATOR_ID ?? 'local',
    sessionId: input.sessionId,
    stimulusType: 'meeting_signal',
    stimulusId: input.signalId,
    stimulusSource: 'meeting',
    stimulusLabel: `${input.signalType}: ${input.text.slice(0, 80)}`,
    correlationId: input.sessionId,
    startedAt: input.ts,
    endedAt: input.ts,
    eventChain: ['meeting_signal'],
    outcome: 'engaged',
    text: input.text,
    depth: 2
  })
  episode.id = `ep-signal-${input.signalId}`
  return recordEpisode(episode)
}

export function recordStarredMomentEpisode(input: {
  sessionId: string
  momentId: string
  text: string
  ts: number
  meetingTitle?: string
}): IntentionEpisode {
  const episode = episodeEngine.recordDirect({
    operatorId: process.env.STREAM_OPERATOR_ID ?? 'local',
    sessionId: input.sessionId,
    stimulusType: 'meeting',
    stimulusId: input.sessionId,
    stimulusSource: 'meeting',
    stimulusLabel: input.meetingTitle ?? input.text.slice(0, 120),
    correlationId: input.sessionId,
    startedAt: input.ts,
    endedAt: input.ts,
    eventChain: ['starred_moment'],
    outcome: 'committed',
    text: input.text,
    depth: 4
  })
  episode.id = `ep-star-${input.momentId}`
  return recordEpisode(episode)
}

export function getEpisodeDashboardData(limit = 50) {
  return {
    episodes: listRecentEpisodes(limit),
    stats: computeEpisodeStats()
  }
}
