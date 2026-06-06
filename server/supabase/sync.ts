import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { OperatorEvent } from '../../shared/operator-events'
import type { FdeTaskSession } from '../../shared/fde-training'

let client: SupabaseClient | null | undefined

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = serverSupabaseSecret()
  return Boolean(url?.trim() && key?.trim())
}

function serverSupabaseSecret(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY
  )?.trim()
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client

  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim()
  const key = serverSupabaseSecret()

  if (!url || !key) {
    client = null
    return null
  }

  // Node 20 lacks native WebSocket — required by @supabase/realtime-js
  if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = ws as unknown as typeof WebSocket
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return client
}

export function resetSupabaseClientForTests(): void {
  client = undefined
}

function rowFromOperatorEvent(event: OperatorEvent, createdAt: number) {
  return {
    id: event.id,
    session_id: event.sessionId,
    operator_id: event.operatorId,
    type: event.type,
    ts: event.ts,
    surface: event.surface ?? null,
    subject_type: event.subjectType ?? null,
    subject_id: event.subjectId ?? null,
    correlation_id: event.correlationId ?? null,
    payload: event.payload ?? {},
    created_at: createdAt
  }
}

export async function syncOperatorEventsToSupabase(events: OperatorEvent[]): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || events.length === 0) return 0

  const now = Date.now()
  const rows = events.map((e) => rowFromOperatorEvent(e, now))
  const { error } = await sb.from('operator_events').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export async function syncTrainingSessionsToSupabase(
  sessions: FdeTaskSession[],
  exportedAt: number
): Promise<number> {
  const sb = getSupabaseAdmin()
  if (!sb || sessions.length === 0) return 0

  const rows = sessions.map((s) => ({
    id: s.id,
    operator_id: s.operatorId,
    correlation_id: s.correlationId,
    session_id: s.sessionId,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    signals: s.signals,
    actions: s.actions,
    meetings: s.meetings,
    traces: s.traces,
    exported_at: exportedAt
  }))

  const { error } = await sb.from('fde_training_sessions').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return rows.length
}

export async function pingSupabase(): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseAdmin()
  if (!sb) return { ok: false, error: 'not configured' }

  const { error } = await sb.from('operator_events').select('id', { count: 'exact', head: true })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { ok: false, error: 'tables missing — run supabase/migrations/001_operator_capture.sql' }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}
