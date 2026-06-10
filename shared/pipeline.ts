export type PipelineStage = 'ingest' | 'transform' | 'store' | 'analyze' | 'train' | 'sync'

export type PipelineLayer = {
  stage: PipelineStage
  name: string
  /** Human-readable persistence location */
  store: string
  count: number
  lastTs?: number
}

export type PipelineHealth = {
  ok: boolean
  operatorId: string
  generatedAt: number
  layers: PipelineLayer[]
  supabase: {
    configured: boolean
    reachable?: boolean
    autoSync: boolean
  }
}

export type PipelineSyncResult = {
  ok: boolean
  generatedAt: number
  ingested: number
  episodesProcessed: number
  trainingSessions: number
  supabaseSynced: number
  intentionEpisodesSynced: number
  errors: string[]
}
