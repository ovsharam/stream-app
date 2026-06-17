import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isMeasureAuthEnabled } from '@/lib/allowlist'
import { streamApiUrl, upstreamHeaders } from '@/lib/stream-api-config'
import { fetchDashboardFromSupabase } from '@/lib/supabase-dashboard'

export async function GET(req: Request) {
  if (isMeasureAuthEnabled()) {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiBase = streamApiUrl()
  if (!apiBase) {
    return NextResponse.json({ error: 'STREAM API not configured' }, { status: 503 })
  }

  const url = new URL(req.url)
  const since = url.searchParams.get('since')
  const target = new URL(`${apiBase}/api/dashboard/data`)
  if (since) target.searchParams.set('since', since)

  try {
    const upstream = await fetch(target.toString(), { headers: upstreamHeaders(), cache: 'no-store' })
    if (upstream.ok) {
      const body = await upstream.text()
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
          'Cache-Control': 'no-store',
          'X-Dashboard-Source': 'live'
        }
      })
    }

    if (upstream.status === 401) {
      const body = await upstream.text()
      return new NextResponse(body, { status: 401 })
    }
  } catch {
    /* fall through to Supabase cache */
  }

  const cached = await fetchDashboardFromSupabase()
  if (cached) {
    return NextResponse.json(cached.snapshot, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'X-Dashboard-Source': 'supabase_cache',
        'X-Dashboard-Cached-At': String(cached.exportedAt)
      }
    })
  }

  return NextResponse.json(
    { error: 'STREAM API unreachable and no Supabase dashboard cache. Run npm run install:stream-stack on your Mac.' },
    { status: 503 }
  )
}
