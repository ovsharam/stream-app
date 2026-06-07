/** Base URL for STREAM API (local tunnel or remote). Empty = same origin (dev proxy only). */
export function streamApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_STREAM_API_URL?.trim()
  if (!raw) return ''
  return raw.replace(/\/$/, '')
}

export function streamSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const api = streamApiBase()
  if (api) return api
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
