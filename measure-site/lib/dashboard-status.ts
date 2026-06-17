export type DashboardApiStatusReason =
  | 'missing_env'
  | 'unreachable'
  | 'auth'
  | 'upstream_error'

export type DashboardApiStatus = {
  configured: boolean
  reachable: boolean
  checking?: boolean
  reason?: DashboardApiStatusReason
  message?: string
  apiUrl?: string
  upstreamStatus?: number
  /** Supabase dashboard_snapshots available when tunnel is down */
  cacheAvailable?: boolean
  cacheAgeMs?: number
  cacheExportedAt?: number
}

export function statusMessage(status: DashboardApiStatus): string {
  if (status.message) return status.message

  if (!status.configured) {
    return 'Set STREAM_API_URL in Vercel to your STREAM API (e.g. https://api.appliedscope.com via Cloudflare Tunnel → local :3131).'
  }

  switch (status.reason) {
    case 'auth':
      return 'STREAM API rejected the request. Ensure MEASURE_API_SECRET matches on Vercel and your local API.'
    case 'unreachable':
      return 'Cannot reach the STREAM API. Start Notch (npm run dev:notch:live) and keep your Cloudflare Tunnel to api.appliedscope.com running.'
    case 'upstream_error':
      return `STREAM API returned an error${status.upstreamStatus ? ` (${status.upstreamStatus})` : ''}. Check local API logs.`
    default:
      return 'Waiting for live data from your STREAM API.'
  }
}
