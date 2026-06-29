import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = getServiceClient()

  // Get connector config
  const { data: connector, error: fetchErr } = await sb
    .from('pg_connectors')
    .select('*')
    .eq('id', id)
    .single()
  if (fetchErr || !connector) {
    return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
  }

  // Create a sync run record
  const runId = randomUUID()
  const now = Date.now()
  await sb.from('pg_connector_sync_runs').insert({
    id: runId,
    connector_id: id,
    customer_id: connector.customer_id,
    status: 'running',
    chunks_processed: 0,
    nodes_extracted: 0,
    started_at: now,
  })

  // If Railway backend is configured, forward the sync request
  const railwayUrl = process.env.STREAM_API_URL
  if (railwayUrl) {
    fetch(`${railwayUrl}/api/stream/connectors/${id}/sync`, { method: 'POST' })
      .catch(() => {/* fire and forget */})
  }

  return NextResponse.json({ ok: true, runId })
}
