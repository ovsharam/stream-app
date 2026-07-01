import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RAILWAY_URL = (process.env.STREAM_API_URL ?? 'https://api.useplumb.ai').replace(/\/$/, '')

type RouteContext = { params: Promise<{ path: string[] }> }

async function handle(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const { path } = await ctx.params

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const upstream = `${RAILWAY_URL}/product-graph/${path.join('/')}${req.nextUrl.search}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  }

  const init: RequestInit = { method: req.method, headers }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = await req.text()
    if (body) init.body = body
  }

  try {
    const res = await fetch(upstream, init)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}

export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle
