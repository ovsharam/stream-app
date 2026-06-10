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
    if (completedAt > 0) parts.push(formatTimeAgo(completedAt, now))
    if (durationMs > 0) parts.push(formatDurationMs(durationMs))
    return parts.join(' · ') || 'Done'
  }

  return formatElapsedMs(now - eventStartedAt(event))
}

function executorLabel(event: CentralStreamEvent): string {
  if (event.meta?.executor === 'claude-code' || event.source === 'claude') return 'Claude Code'
  if (event.meta?.runtime === 'cloud') return 'Cursor cloud'
  return 'Cursor'
}

function buildTitle(event: CentralStreamEvent): string {
  const query = event.meta?.query ? String(event.meta.query) : ''
  if (query) return sanitizeDisplayText(query, 80)
  const title = event.title?.trim()
  if (title && !/^cursor build$/i.test(title) && !/^claude code build$/i.test(title)) {
    return sanitizeDisplayText(title, 80)
  }
  return 'Build run'
}

type Props = {
  event: CentralStreamEvent
  now: number
  variant?: 'active' | 'compact' | 'history'
  stepOverride?: string
  onOpenInCursor?: () => void
}

export function BuildRunCard({ event, now, variant = 'compact', stepOverride, onOpenInCursor }: Props) {
  const tone = buildStatusTone(event)
  const title = buildTitle(event)
  const executor = executorLabel(event)
  const streamStep = event.meta?.currentStep ? sanitizeDisplayText(String(event.meta.currentStep), 220) : null
  const polledStep = stepOverride ? sanitizeDisplayText(stepOverride, 220) : null
  const liveStep = streamStep || polledStep
  const preview =
    tone === 'running'
      ? liveStep || 'Working…'
      : sanitizeDisplayText(event.body, variant === 'active' ? 200 : 120)
  const project = event.meta?.projectName ? String(event.meta.projectName) : null
  const timing = buildTimingLabel(event, now)

  if (variant === 'history') {
    return (
      <article className={`x-build-row x-build-row-${tone}`}>
        <span className={`x-build-row-dot x-build-row-dot-${tone}`} aria-hidden />
        <div className="x-build-row-main">
          <div className="x-build-row-top">
            <span className="x-build-row-executor">{executor}</span>
            <span className="x-build-row-title" title={title}>
              {title}
            </span>
          </div>
          {tone === 'error' && preview ? (
            <p className="x-build-row-sub">{preview}</p>
          ) : project ? (
            <p className="x-build-row-sub">{project}</p>
          ) : null}
        </div>
        <span className="x-build-row-time">{timing}</span>
        {onOpenInCursor && tone !== 'error' ? (
          <button type="button" className="x-build-row-action" onClick={onOpenInCursor}>
            Open
          </button>
        ) : null}
      </article>
    )
  }

  return (
    <article
      className={`x-build-card x-build-card-${tone}${variant === 'active' ? ' x-build-card-active' : ''}`}
    >
      <div className="x-build-card-head">
        <div className="x-build-card-headline">
          {tone === 'running' ? <span className="x-build-card-pulse" aria-hidden /> : null}
          <div className="x-build-card-copy">
            <span className="x-build-card-executor">{executor}</span>
            <h3 className="x-build-card-title" title={title}>
              {tone === 'running' ? preview : title}
            </h3>
          </div>
        </div>
        <span className={`x-build-card-badge x-build-card-badge-${tone}`}>{timing}</span>
      </div>

      {tone === 'running' ? (
        <p className="x-build-card-prompt" title={title}>
          {title}
        </p>
      ) : preview && preview !== title ? (
        <p className="x-build-card-preview">{preview}</p>
      ) : null}

      {(project || onOpenInCursor) && (
        <div className="x-build-card-foot">
          <div className="x-build-card-meta">{project ? <span>{project}</span> : null}</div>
          {onOpenInCursor ? (
            <button type="button" className="x-build-row-action" onClick={onOpenInCursor}>
              Open in Cursor
            </button>
          ) : null}
        </div>
      )}
    </article>
  )
}
