import type { DataDashboardSnapshot } from '../../shared/dashboard'
import { getSupabaseAdmin } from './sync'

const DEFAULT_OPERATOR_ID = process.env.STREAM_OPERATOR_ID ?? 'local'

export async function syncDashboardSnapshotToSupabase(
  snapshot: DataDashboardSnapshot
): Promise<boolean> {
  const sb = getSupabaseAdmin()
  if (!sb) return false

  const operatorId = DEFAULT_OPERATOR_ID
  const exportedAt = Date.now()
  const { error } = await sb.from('dashboard_snapshots').upsert(
    {
      id: operatorId,
      operator_id: operatorId,
      snapshot,
      exported_at: exportedAt
    },
    { onConflict: 'id' }
  )
  if (error) throw error
  return true
}
