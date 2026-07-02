import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireOrg, getServiceClient } from '@/lib/connector-auth'

export async function GET(_req: NextRequest) {
  const ctx = await requireOrg()
  if (ctx instanceof NextResponse) return ctx

  const sb = getServiceClient()
  const { data, error } = await sb
    .from('pg_connectors')
    .select('*')
    .eq('customer_id', ctx.orgId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const connectors = (data ?? []).map(r => ({
    id: r.id,
    type: r.type,
    label: r.label,
    status: r.status,
    errorMsg: r.error_msg,
    lastSyncAt: r.last_sync_at,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ connectors })
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrg()
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json()
  const { type, label, credentials = {}, settings = {} } = body
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const sb = getServiceClient()
  const now = Date.now()
  const id = randomUUID()
  const { data, error } = await sb.from('pg_connectors').insert({
    id,
    customer_id: ctx.orgId, // org from session — client-supplied customerId is ignored
    type,
    label: label ?? type,
    credentials_json: JSON.stringify(credentials),
    settings_json: JSON.stringify(settings),
    status: Object.keys(credentials).length ? 'active' : 'pending_auth',
    created_at: now,
    updated_at: now,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connector: { id: data.id, type: data.type, label: data.label, status: data.status } })
}
