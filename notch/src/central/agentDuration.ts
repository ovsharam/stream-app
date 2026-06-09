import { useEffect, useState } from 'react'

const TERMINAL_AGENT_STATUS = new Set([
  'done',
  'completed',
  'finished',
  'failed',
  'cancelled',
  'error',
  'success',
  'stale',
  'unknown'
])

export function isTerminalAgentStatus(status: string): boolean {
  return TERMINAL_AGENT_STATUS.has(status.trim().toLowerCase())
}

export function formatElapsedMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`
}

export function formatDurationMs(ms: number): string {
  return formatElapsedMs(ms)
}

export function formatTimeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function eventStartedAt(event: { ts: number; meta?: Record<string, unknown> }): number {
  const raw = event.meta?.startedAt
  if (raw) {
    const parsed = new Date(String(raw)).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }
  return event.ts
}

export function useTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
