import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireOrg, getServiceClient, assertConnectorOwned } from '@/lib/connector-auth'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg()
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const sb = getServiceClient()
  const denied = await assertConnectorOwned(sb, id, ctx.orgId)
  if (denied) return denied

  // Create a sync run record
  const runId = randomUUID()
  const now = Date.now()
  await sb.from('pg_connector_sync_runs').insert({
    id: runId,
    connector_id: id,
    customer_id: ctx.orgId,
    status: 'running',
    chunks_processed: 0,
    nodes_extracted: 0,
    started_at: now,
  })

  // If Railway backend is configured, forward the sync request with the user's JWT
  const railwayUrl = (process.env.STREAM_API_URL ?? 'https://api.useplumb.ai').replace(/\/$/, '')
  fetch(`${railwayUrl}/connectors/${id}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.accessToken}` },
  }).catch(() => {/* fire and forget */})

  return NextResponse.json({ ok: true, runId })
}
