import type { CentralStreamEvent } from '@shared/cluster'
import { sanitizeDisplayText } from '@shared/displayText'
import {
  eventStartedAt,
  formatDurationMs,
  formatElapsedMs,
  formatTimeAgo,
  isTerminalAgentStatus
} from './agentDuration'

export function buildStatusTone(event: CentralStreamEvent): 'running' | 'done' | 'error' {
  const raw = String(event.meta?.agentStatus ?? event.meta?.phase ?? '').trim().toLowerCase()
  if (isTerminalAgentStatus(raw)) {
    return raw === 'failed' || raw === 'error' || raw === 'cancelled' || raw === 'stale' || raw === 'unknown'
      ? 'error'
      : 'done'
  }
  if (event.kind === 'build_prompt') return 'running'
  return raw === 'running' || raw === 'queued' || raw === 'in_progress' ? 'running' : 'done'
}

export function eventStatusLabel(event: CentralStreamEvent): string {
  const raw = String(event.meta?.agentStatus ?? event.meta?.phase ?? '').trim()
  if (raw) return raw.replace(/_/g, ' ')
  if (event.kind === 'build_prompt') return 'building'
  return 'queued'
}

export function buildTimingLabel(event: CentralStreamEvent, now: number): string {
  const durationMs = Number(event.meta?.durationMs ?? 0)
  const completedAt = event.meta?.completedAt ? new Date(String(event.meta.completedAt)).getTime() : 0
  const tone = buildStatusTone(event)

  if (tone !== 'running') {
    const parts: string[] = []
    if (completedAt > 0) parts.push(`Completed ${formatTimeAgo(completedAt, now)}`)
    if (durationMs > 0) parts.push(`ran ${formatDurationMs(durationMs)}`)
    return parts.join(' · ') || 'Completed'
  }

  return `Working ${formatElapsedMs(now - eventStartedAt(event))}`
}

type Props = {
  event: CentralStreamEvent
  now: number
  variant?: 'active' | 'compact'
  stepOverride?: string
  onOpenInCursor?: () => void
}

export function BuildRunCard({ event, now, variant = 'compact', stepOverride, onOpenInCursor }: Props) {
  const tone = buildStatusTone(event)
  const prompt = sanitizeDisplayText(event.title || 'Cursor build', variant === 'active' ? 100 : 72)
  const streamStep = event.meta?.currentStep ? sanitizeDisplayText(String(event.meta.currentStep), 220) : null
  const polledStep = stepOverride ? sanitizeDisplayText(stepOverride, 220) : null
  const liveStep = streamStep || polledStep
  const preview =
    tone === 'running'
      ? liveStep || 'Waiting for Cursor — open the project to watch live output.'
      : sanitizeDisplayText(event.body, variant === 'active' ? 200 : 140)
  const project = event.meta?.projectName ? String(event.meta.projectName) : null
  const agentId = event.meta?.agentId ? String(event.meta.agentId) : null

  return (
    <article
      className={`x-build-card x-build-card-${tone}${variant === 'active' ? ' x-build-card-active' : ''}`}
    >
      <div className="x-build-card-head">
        <div className="x-build-card-headline">
          {tone === 'running' ? <span className="x-build-card-pulse" aria-hidden /> : null}
          <h3 className="x-build-card-title" title={tone === 'running' ? liveStep ?? prompt : event.title}>
            {tone === 'running' ? preview : prompt}
          </h3>
        </div>
        <span className={`x-build-card-badge x-build-card-badge-${tone}`}>
          {tone === 'running' ? buildTimingLabel(event, now) : eventStatusLabel(event)}
        </span>
      </div>

      {tone !== 'running' ? (
        <p className="x-build-card-timing">{buildTimingLabel(event, now)}</p>
      ) : (
        <p className="x-build-card-prompt" title={event.title}>
          {prompt}
        </p>
      )}

      {tone === 'running' ? null : <p className="x-build-card-preview">{preview}</p>}

      <div className="x-build-card-foot">
        <div className="x-build-card-meta">
          {project ? <span>{project}</span> : null}
          {agentId ? <code>{agentId}</code> : null}
        </div>
        {onOpenInCursor ? (
          <button type="button" className="x-int-btn x-int-btn-ghost x-build-card-open" onClick={onOpenInCursor}>
            Open in Cursor
          </button>
        ) : null}
      </div>
    </article>
  )
}
