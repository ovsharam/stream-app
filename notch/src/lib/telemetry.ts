import type { TelemetryEvent, TelemetryPayload } from '@shared/telemetry'

const SESSION_ID = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const FLUSH_INTERVAL_MS = 10_000
const MAX_QUEUE = 200

let queue: TelemetryPayload[] = []
let flushTimer: number | null = null
let enabled = true

function payload(event: TelemetryEvent): TelemetryPayload {
  return {
    ...event,
    sessionId: SESSION_ID,
    ts: Date.now()
  }
}

export function track(event: TelemetryEvent): void {
  if (!enabled) return
  queue.push(payload(event))
  if (queue.length >= MAX_QUEUE) void flush()
}

async function flush(): Promise<void> {
  if (queue.length === 0) return
  const batch = queue.splice(0)
  try {
    await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true
    })
  } catch {
    // silently drop — telemetry must never break the app
  }
}

function startAutoFlush(): void {
  if (flushTimer !== null) return
  flushTimer = window.setInterval(() => void flush(), FLUSH_INTERVAL_MS)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('beforeunload', () => void flush())
}

export function initTelemetry(opts?: { enabled?: boolean }): void {
  enabled = opts?.enabled !== false
  if (enabled) startAutoFlush()
}

// ── Higher-level helpers ────────────────────────────────────────────────────

/** Call when a feed item becomes visible. Returns a cleanup fn to record dwell. */
export function trackImpression(
  itemId: string,
  source: string,
  rank?: number
): () => void {
  track({ event: 'feed.impression', itemId, source, rank })
  const start = Date.now()
  return () => {
    const durationMs = Date.now() - start
    if (durationMs > 800) {
      track({ event: 'feed.dwell', itemId, source, durationMs })
    }
  }
}

/** Track when the user rates a feed signal. */
export function rateFeedSignal(
  itemId: string,
  source: string,
  rating: 'confirmed' | 'noise' | 'known'
): void {
  track({ event: 'feed.signal_rate', itemId, source, rating })
}
