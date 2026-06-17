import type { DataDashboardSnapshot } from '@shared/dashboard'
import { normalizeDashboardSnapshot } from '@shared/dashboard'

export type SupabaseDashboardCache = {
  snapshot: DataDashboardSnapshot
  exportedAt: number
  operatorId: string
}

function supabaseConfig(): { url: string; key: string; operatorId: string } | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const key = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY
  )?.trim()
  if (!url || !key) return null
  return { url: url.replace(/\/$/, ''), key, operatorId: process.env.STREAM_OPERATOR_ID?.trim() || 'local' }
}

export function supabaseDashboardConfigured(): boolean {
  return supabaseConfig() != null
}

export async function fetchDashboardFromSupabase(): Promise<SupabaseDashboardCache | null> {
  const cfg = supabaseConfig()
  if (!cfg) return null

  const target = new URL(`${cfg.url}/rest/v1/dashboard_snapshots`)
  target.searchParams.set('id', `eq.${cfg.operatorId}`)
  target.searchParams.set('select', 'snapshot,exported_at,operator_id')
  target.searchParams.set('limit', '1')

  const res = await fetch(target.toString(), {
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: 'application/json'
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000)
  })

  if (!res.ok) return null
  const rows = (await res.json()) as Array<{
    snapshot: DataDashboardSnapshot
    exported_at: number
    operator_id: string
  }>
  const row = rows[0]
  if (!row?.snapshot) return null

  return {
    snapshot: normalizeDashboardSnapshot(row.snapshot),
    exportedAt: Number(row.exported_at),
    operatorId: row.operator_id
  }
}
