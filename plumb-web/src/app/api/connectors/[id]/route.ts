import { NextRequest, NextResponse } from 'next/server'
import { requireOrg, getServiceClient, assertConnectorOwned } from '@/lib/connector-auth'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg()
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const sb = getServiceClient()
  const denied = await assertConnectorOwned(sb, id, ctx.orgId)
  if (denied) return denied

  const { error } = await sb.from('pg_connectors').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
