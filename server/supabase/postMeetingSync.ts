import {
  isSupabaseConfigured,
  syncAllIntentionEpisodesToSupabase,
  syncMeetingCorpusToSupabase,
  syncTrainingExportToSupabase
} from './sync'

export type PostMeetingSyncResult = {
  ok: boolean
  sessionId: string
  meetingSynced: boolean
  trainingSessionsSynced: number
  intentionEpisodesSynced: number
  error?: string
}

function supabaseAutoSyncEnabled(): boolean {
  if (process.env.SUPABASE_SYNC_DISABLED === '1') return false
  return isSupabaseConfigured()
}

/** Fire-and-forget after post-call capture — never blocks the meeting pipeline. */
export function queuePostMeetingSupabaseSync(sessionId: string, engagementId?: string): void {
  if (!supabaseAutoSyncEnabled()) return
  void runPostMeetingSupabaseSync(sessionId, engagementId).catch((err) => {
    console.warn(
      '[supabase] post-meeting sync failed:',
      err instanceof Error ? err.message : err
    )
  })
}

export async function runPostMeetingSupabaseSync(
  sessionId: string,
  engagementId?: string
): Promise<PostMeetingSyncResult> {
  if (!supabaseAutoSyncEnabled()) {
    return {
      ok: false,
      sessionId,
      meetingSynced: false,
      trainingSessionsSynced: 0,
      intentionEpisodesSynced: 0,
      error: 'not configured'
    }
  }

  const { exportMeetingCorpus } = await import('../fde/trainingStore')
  const corpus = exportMeetingCorpus(sessionId, engagementId)
  await syncMeetingCorpusToSupabase(corpus)

  const training = await syncTrainingExportToSupabase()
  const intentionEpisodesSynced = await syncAllIntentionEpisodesToSupabase()
  console.log(
    `[supabase] post-meeting sync ${sessionId}: snapshot ok, ${training.synced} training session(s), ${intentionEpisodesSynced} episode(s)`
  )

  return {
    ok: true,
    sessionId,
    meetingSynced: true,
    trainingSessionsSynced: training.synced,
    intentionEpisodesSynced
  }
}

export async function runFullTrainingSupabaseSync(): Promise<{
  synced: number
  intentionEpisodesSynced: number
  stats: import('../../shared/fde-training').FdeTrainingDataset['stats']
}> {
  const training = await syncTrainingExportToSupabase()
  const intentionEpisodesSynced = await syncAllIntentionEpisodesToSupabase()
  return { ...training, intentionEpisodesSynced }
}
