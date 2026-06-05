/** Shared cooldown when Google returns user-rate / quota errors. */

let blockedUntilMs = 0
let lastReason: string | null = null

export function parseGoogleRetryAfterMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err)
  if (!/user-rate limit|rate limit|quota exceeded|too many requests/i.test(msg)) return null
  const retry = msg.match(/retry after ([0-9TZ:.+-]+)/i)?.[1]
  if (retry) {
    const t = new Date(retry).getTime()
    if (!Number.isNaN(t)) return t
  }
  return Date.now() + 20 * 60_000
}

export function isRateLimitMessage(msg: string | null | undefined): boolean {
  if (!msg) return false
  return /user-rate limit|rate limit|quota exceeded|too many requests|before connecting or syncing/i.test(
    msg
  )
}

export function effectiveGoogleSyncError(cached: string | null): string | null {
  const blocked = googleApiBlockedMessage()
  if (blocked) return blocked
  if (cached && isRateLimitMessage(cached)) return null
  return cached
}

export function markGoogleRateLimited(err: unknown, source?: string): void {
  if (isGoogleApiBlocked()) return
  const until = parseGoogleRetryAfterMs(err)
  if (!until) return
  blockedUntilMs = Math.max(blockedUntilMs, until)
  lastReason = err instanceof Error ? err.message : String(err)
  console.warn(
    '[google-api] rate limited until',
    new Date(blockedUntilMs).toISOString(),
    source ? `(${source})` : '',
    lastReason
  )
}

export function logGoogleApiCall(source: string): void {
  console.log('[google-api] call:', source)
}

export function assertGoogleApiAllowed(source: string): void {
  if (isGoogleApiBlocked()) {
    console.warn('[google-api] blocked call skipped:', source)
    throw new Error(googleApiBlockedMessage() ?? 'Google API rate limit active')
  }
  logGoogleApiCall(source)
}

export function isGoogleApiBlocked(): boolean {
  return Date.now() < blockedUntilMs
}

export function googleApiBlockedMessage(): string | null {
  if (!isGoogleApiBlocked()) return null
  const when = new Date(blockedUntilMs)
  const label = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `Google API rate limit — wait until about ${label} before connecting or syncing Gmail.`
}

export function clearGoogleRateLimit(): void {
  blockedUntilMs = 0
  lastReason = null
}

export function getGoogleApiStatus(): {
  blocked: boolean
  blockedUntilMs: number | null
  blockedUntil: string | null
  lastReason: string | null
} {
  const blocked = isGoogleApiBlocked()
  return {
    blocked,
    blockedUntilMs: blocked ? blockedUntilMs : null,
    blockedUntil: blocked ? new Date(blockedUntilMs).toISOString() : null,
    lastReason: blocked ? lastReason : null
  }
}
