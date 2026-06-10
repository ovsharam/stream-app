import { useEffect, useRef } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import {
  BUILD_AGENTS,
  parseBuildLogLines,
  buildRunStatus,
  buildExecutorFromEvent
} from '@shared/build-dojo'
import { formatElapsedMs, useTick } from './agentDuration'
import { BuildDojoMessage, buildAgentMessageContent } from './BuildDojoMessage'
import { integrationApi } from '../lib/api'

type Props = {
  event: CentralStreamEvent | undefined
  streamItemId: string
  onBackToChat: () => void
  onStop?: () => void
}

function executorLabel(event: CentralStreamEvent | undefined): string {
  const id = buildExecutorFromEvent(event ?? ({} as CentralStreamEvent))
  return BUILD_AGENTS.find((a) => a.id === id)?.name ?? 'Build agent'
}

export function BuildAgentPanel({ event, streamItemId, onBackToChat, onStop }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const now = useTick(1000)
  const status = event ? buildRunStatus(event) : 'running'
  const logLines = parseBuildLogLines(event?.meta).map((l) => l.text)
  const content = buildAgentMessageContent(event, logLines)
  const deployUrl = status === 'done' ? String(event?.meta?.deployUrl ?? '') : ''
  const startedAt = event?.meta?.startedAt
    ? new Date(String(event.meta.startedAt)).getTime()
    : event?.ts ?? Date.now()

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [content, logLines.length])

  const handleStop = async () => {
    try {
      await integrationApi.buildCancel(streamItemId)
      onStop?.()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="x-build-agent-pane">
      <header className="x-build-agent-chrome">
        <button type="button" className="x-build-agent-back" onClick={onBackToChat}>
          ‹ Chat
        </button>
        <div className="x-build-agent-chrome-meta">
          <span className="x-build-agent-chrome-title">{executorLabel(event)}</span>
          <span className={`x-build-agent-status x-build-agent-status-${status}`}>
            {status === 'running'
              ? `Running · ${formatElapsedMs(now - startedAt)}`
              : status === 'error'
                ? 'Failed'
                : 'Done'}
          </span>
        </div>
        <div className="x-build-agent-chrome-actions">
          {status === 'running' ? (
            <button type="button" className="x-build-agent-stop" onClick={() => void handleStop()}>
              Stop
            </button>
          ) : null}
        </div>
      </header>

      <div className="x-build-agent-body" ref={scrollRef}>
        {!event ? (
          <p className="x-build-agent-empty">Waiting for agent output…</p>
        ) : (
          <div className="x-build-agent-output">
            {logLines.length > 0 ? (
              <div className="x-build-agent-logs">
                {parseBuildLogLines(event.meta).map((line, i) => (
                  <div key={`${line.ts}-${i}`} className="x-dojo-log-line">
                    <span className="x-dojo-log-ts">
                      {new Date(line.ts).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    <span className="x-dojo-log-exec">{executorShort(event)}</span>
                    <span className="x-dojo-log-text">{line.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="x-build-agent-summary">
              <BuildDojoMessage role="agent" content={content} deployUrl={deployUrl || null} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function executorShort(event: CentralStreamEvent): string {
  const id = buildExecutorFromEvent(event)
  if (id === 'claude-code') return 'CC'
  if (id === 'cursor-cloud') return '☁'
  if (id === 'cursor-local') return 'Cu'
  return '◆'
}
