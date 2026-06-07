/** Server-side STREAM API configuration (Vercel env — not exposed to browser). */

export function streamApiUrl(): string | null {
  const raw = process.env.STREAM_API_URL?.trim() ?? process.env.NEXT_PUBLIC_STREAM_API_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function streamSocketUrl(): string | null {
  const raw =
    process.env.STREAM_SOCKET_URL?.trim() ??
    process.env.NEXT_PUBLIC_SOCKET_URL?.trim() ??
    streamApiUrl()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function measureApiSecret(): string | null {
  return process.env.MEASURE_API_SECRET?.trim() || null
}

export function upstreamHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const secret = measureApiSecret()
  if (secret) headers.Authorization = `Bearer ${secret}`
  return headers
}
