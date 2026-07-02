import { NextRequest, NextResponse } from 'next/server'
import { requireOrg, getServiceClient, assertConnectorOwned } from '@/lib/connector-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg()
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const sb = getServiceClient()
  const denied = await assertConnectorOwned(sb, id, ctx.orgId)
  if (denied) return denied

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
