import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isMeasureAuthEnabled } from '@/lib/allowlist'
import { streamApiUrl, upstreamHeaders } from '@/lib/stream-api-config'

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

  const upstream = await fetch(target.toString(), { headers: upstreamHeaders(), cache: 'no-store' })
  const body = await upstream.text()

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': 'no-store'
    }
  })
}
