import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')
  return createServiceClient(url, key)
}

export async function GET(req: NextRequest) {
  const customerId = req.nextUrl.searchParams.get('customerId') ?? 'plumb-internal'
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('pg_connectors')
    .select('*')
    .eq('customer_id', customerId)
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
  const body = await req.json()
  const { customerId = 'plumb-internal', type, label, credentials = {}, settings = {} } = body
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const sb = getServiceClient()
  const now = Date.now()
  const id = randomUUID()
  const { data, error } = await sb.from('pg_connectors').insert({
    id,
    customer_id: customerId,
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
