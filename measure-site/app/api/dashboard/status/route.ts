import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
import { auth } from '@/auth'
import { isMeasureAuthEnabled } from '@/lib/allowlist'
import type { DashboardApiStatus } from '@/lib/dashboard-status'
import { measureApiSecret, streamApiUrl, upstreamHeaders } from '@/lib/stream-api-config'

const PROBE_TIMEOUT_MS = 8_000

export async function GET() {
  if (isMeasureAuthEnabled()) {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiBase = streamApiUrl()
  if (!apiBase) {
    const body: DashboardApiStatus = {
      configured: false,
      reachable: false,
      reason: 'missing_env',
      message:
        'Set STREAM_API_URL in Vercel to your STREAM API (e.g. https://api.appliedscope.com via Cloudflare Tunnel → local :3131).'
    }
    return NextResponse.json(body)
  }

  try {
    const target = `${apiBase}/api/dashboard/data`
    const upstream = await fetch(target, {
      headers: upstreamHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    })

    if (upstream.ok) {
      const body: DashboardApiStatus = {
        configured: true,
        reachable: true,
        apiUrl: apiBase
      }
      return NextResponse.json(body)
    }

    if (upstream.status === 401) {
      const body: DashboardApiStatus = {
        configured: true,
        reachable: false,
        reason: 'auth',
        apiUrl: apiBase,
        upstreamStatus: 401,
        message:
          'STREAM API rejected the request. Ensure MEASURE_API_SECRET matches on Vercel and your local API.'
      }
      return NextResponse.json(body)
    }

    const body: DashboardApiStatus = {
      configured: true,
      reachable: false,
      reason: 'upstream_error',
      apiUrl: apiBase,
      upstreamStatus: upstream.status,
      message: `STREAM API returned HTTP ${upstream.status}. Check local API logs.`
    }
    return NextResponse.json(body)
  } catch {
    const body: DashboardApiStatus = {
      configured: true,
      reachable: false,
      reason: 'unreachable',
      apiUrl: apiBase,
      message:
        'Cannot reach the STREAM API. Start Notch (npm run dev:notch:live) and keep your Cloudflare Tunnel to api.appliedscope.com running.'
    }
    return NextResponse.json(body)
  }
}
