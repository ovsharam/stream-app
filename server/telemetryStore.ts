import type { TelemetryPayload } from '../shared/telemetry'

let supabase: { from: (table: string) => { insert: (rows: unknown[]) => Promise<{ error?: unknown }> } } | null = null

async function getSupabase() {
  if (supabase) return supabase
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SECRET_KEY?.trim() ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? process.env.SUPABASE_ANON_KEY?.trim()
    if (!url || !key) return null
    supabase = createClient(url, key)
    return supabase
  } catch {
    return null
  }
}

// In-memory fallback ring buffer (last 2000 events) when Supabase is not configured
const LOCAL_BUFFER: TelemetryPayload[] = []
const LOCAL_MAX = 2000

export async function storeTelemetryEvents(
  events: TelemetryPayload[],
  userId?: string
): Promise<void> {
  const enriched = events.map((e) => ({ ...e, userId: userId ?? e.userId }))

  // Always keep in local buffer for real-time querying
  LOCAL_BUFFER.push(...enriched)
  if (LOCAL_BUFFER.length > LOCAL_MAX) LOCAL_BUFFER.splice(0, LOCAL_BUFFER.length - LOCAL_MAX)

  const db = await getSupabase()
  if (!db) return

  try {
    const rows = enriched.map((e) => ({
      event: e.event,
      session_id: e.sessionId,
      user_id: e.userId,
      ts: new Date(e.ts).toISOString(),
      properties: e
    }))
    const { error } = await db.from('telemetry_events').insert(rows)
    if (error) console.warn('[telemetry] supabase insert error:', error)
  } catch (err) {
    console.warn('[telemetry] store failed:', (err as Error).message)
  }
}

export function getRecentTelemetry(limit = 500): TelemetryPayload[] {
  return LOCAL_BUFFER.slice(-limit)
}

export function getTelemetryBySession(sessionId: string): TelemetryPayload[] {
  return LOCAL_BUFFER.filter((e) => e.sessionId === sessionId)
}
