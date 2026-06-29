import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('pg_connector_sync_runs')
    .select('*')
    .eq('connector_id', id)
    .order('started_at', { ascending: false })
    .limit(10)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const runs = (data ?? []).map(r => ({
    id: r.id,
    status: r.status,
    chunksProcessed: r.chunks_processed,
    nodesExtracted: r.nodes_extracted,
    errorMsg: r.error_msg,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  }))
  return NextResponse.json({ runs })
}
