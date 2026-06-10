import { homedir } from 'os'
import { join } from 'path'
import type { PipelineHealth, PipelineLayer, PipelineSyncResult } from '../../shared/pipeline'
import { getRecentItems } from '../db'

function countStreamItems(): number {
  try {
    const mod = require('../db-sqlite') as typeof import('../db-sqlite')
    return mod.countStreamItems()
  } catch {
    return getRecentItems(500).length
  }
}
import {
  countDatapoints,
  countEdges,
  countEntities,
  countTraces,
  listDatapoints
} from '../kb/store'
import {
  countOperatorEvents,
  listOperatorEvents
} from '../telemetry/store'
import { countEpisodes, listRecentEpisodes } from '../intention/episodeStore'
import { getTrainingSummary } from '../fde/trainingStore'
import { isSupabaseConfigured, pingSupabase } from '../supabase/sync'
import { ingestRecentStream } from '../kb/pipeline'
import { processOperatorEventsForEpisodes } from '../intention/service'
import { buildFdeTrainingDataset } from '../training/dataset'
import { runFullTrainingSupabaseSync } from '../supabase/postMeetingSync'

const DEFAULT_OPERATOR_ID = process.env.STREAM_OPERATOR_ID ?? 'local'
const DATA_DIR = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')

function supabaseAutoSyncEnabled(): boolean {
  if (process.env.SUPABASE_SYNC_DISABLED === '1') return false
  return isSupabaseConfigured()
}

function lastTs(rows: { ts?: number; ingestedAt?: number; startedAt?: number }[]): number | undefined {
  let max = 0
  for (const row of rows) {
    const t = row.ts ?? row.ingestedAt ?? row.startedAt ?? 0
    if (t > max) max = t
  }
  return max > 0 ? max : undefined
}

export async function getPipelineHealth(): Promise<PipelineHealth> {
  const streamItems = getRecentItems(1)
  const recentDp = listDatapoints(5)
  const recentOp = listOperatorEvents({ limit: 5 })
  const recentEp = listRecentEpisodes(5)
  const training = getTrainingSummary()

  const layers: PipelineLayer[] = [
    {
      stage: 'ingest',
      name: 'Stream items',
      store: `${DATA_DIR}/stream.db`,
      count: countStreamItems(),
      lastTs: streamItems[0]?.timestamp.getTime()
    },
    {
      stage: 'ingest',
      name: 'Operator events',
      store: `${DATA_DIR}/operator-events.sqlite`,
      count: countOperatorEvents(),
      lastTs: lastTs(recentOp.map((e) => ({ ts: e.ts })))
    },
    {
      stage: 'transform',
      name: 'KB datapoints',
      store: `${DATA_DIR}/personal-kb.sqlite`,
      count: countDatapoints(),
      lastTs: lastTs(recentDp.map((d) => ({ ingestedAt: d.ingestedAt })))
    },
    {
      stage: 'store',
      name: 'KB entities',
      store: `${DATA_DIR}/personal-kb.sqlite`,
      count: countEntities()
    },
    {
      stage: 'store',
      name: 'KB graph edges',
      store: `${DATA_DIR}/personal-kb.sqlite`,
      count: countEdges()
    },
    {
      stage: 'store',
      name: 'Action traces',
      store: `${DATA_DIR}/personal-kb.sqlite`,
      count: countTraces()
    },
    {
      stage: 'analyze',
      name: 'Intention episodes',
      store: `${DATA_DIR}/intention-episodes.sqlite`,
      count: countEpisodes(),
      lastTs: lastTs(recentEp.map((e) => ({ startedAt: e.startedAt, ts: e.endedAt })))
    },
    {
      stage: 'train',
      name: 'FDE training corpus',
      store: `${DATA_DIR}/fde-training.sqlite`,
      count:
        training.meetingRecords +
        training.signals +
        training.buildRuns +
        training.decisionEvents
    }
  ]

  const sbConfigured = isSupabaseConfigured()
  let sbReachable: boolean | undefined
  if (sbConfigured) {
    const ping = await pingSupabase()
    sbReachable = ping.ok
  }

  return {
    ok: layers.some((l) => l.count > 0) || sbReachable === true,
    operatorId: DEFAULT_OPERATOR_ID,
    generatedAt: Date.now(),
    layers,
    supabase: {
      configured: sbConfigured,
      reachable: sbReachable,
      autoSync: supabaseAutoSyncEnabled()
    }
  }
}

/**
 * End-to-end pipeline tick: ingest recent stream → process episodes → build training export → Supabase sync.
 */
export async function runPipelineSync(): Promise<PipelineSyncResult> {
  const errors: string[] = []
  let ingested = 0
  let episodesProcessed = 0
  let trainingSessions = 0
  let supabaseSynced = 0
  let intentionEpisodesSynced = 0

  try {
    ingested = ingestRecentStream(120)
  } catch (err) {
    errors.push(`ingest: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const pending = listOperatorEvents({ limit: 500 })
    if (pending.length > 0) {
      processOperatorEventsForEpisodes(pending)
      episodesProcessed = pending.length
    }
  } catch (err) {
    errors.push(`episodes: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const dataset = buildFdeTrainingDataset()
    trainingSessions = dataset.sessions.length
  } catch (err) {
    errors.push(`train: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (supabaseAutoSyncEnabled()) {
    try {
      const sync = await runFullTrainingSupabaseSync()
      supabaseSynced = sync.synced
      intentionEpisodesSynced = sync.intentionEpisodesSynced
    } catch (err) {
      errors.push(`sync: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    ok: errors.length === 0,
    generatedAt: Date.now(),
    ingested,
    episodesProcessed,
    trainingSessions,
    supabaseSynced,
    intentionEpisodesSynced,
    errors
  }
}

let syncTimer: ReturnType<typeof setInterval> | null = null

export function startPipelineAutoSync(intervalMs = 5 * 60_000): void {
  if (!supabaseAutoSyncEnabled() || syncTimer) return
  syncTimer = setInterval(() => {
    void runPipelineSync().then((r) => {
      if (r.supabaseSynced > 0 || r.ingested > 0) {
        console.log(
          `[pipeline] sync: ingested=${r.ingested} sessions=${r.trainingSessions} supabase=${r.supabaseSynced}`
        )
      }
    })
  }, intervalMs)
  console.log(`[pipeline] auto-sync every ${Math.round(intervalMs / 60_000)}m (Supabase)`)
}
