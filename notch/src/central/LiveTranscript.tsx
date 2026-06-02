import { useEffect, useMemo, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { openMeeting } from '../lib/api'

type Props = {
  events: CentralStreamEvent[]
  active: boolean
}

type TranscriptLine = {
  id: string
  speaker: string
  text: string
  ts: number
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function extractLines(events: CentralStreamEvent[]): TranscriptLine[] {
  return events
    .filter((e) => e.kind === 'transcript_live')
    .map((e) => ({
      id: e.id,
      speaker: e.speaker ?? 'Speaker',
      text: e.body,
      ts: e.ts
    }))
    .sort((a, b) => a.ts - b.ts)
}

export function LiveCallView({ events, active }: Props) {
  const lines = useMemo(() => extractLines(events), [events])
  const assistEvents = useMemo(
    () => events.filter((e) => e.kind === 'assist').sort((a, b) => b.ts - a.ts),
    [events]
  )
  const doneEvent = useMemo(
    () => events.find((e) => e.kind === 'transcript_done'),
    [events]
  )
  const joinEvent = useMemo(
    () => events.find((e) => e.joinable && e.meetingLink),
    [events]
  )

  const callTitle = events.find((e) => e.kind === 'transcript_live')?.title ?? 'Live call'

  const startTs = lines[0]?.ts ?? Date.now()
  const [elapsed, setElapsed] = useState(() => Date.now() - startTs)
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasCall = active || lines.length > 0 || Boolean(doneEvent)

  useEffect(() => {
    if (!active) return
    const tick = () => setElapsed(Date.now() - startTs)
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [active, startTs])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !active) return
    el.scrollTop = el.scrollHeight
  }, [lines.length, active])

  if (!hasCall) {
    return (
      <div className="x-live-call-empty">
        <div className="x-live-call-empty-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="32" height="32">
            <path
              fill="currentColor"
              d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"
            />
          </svg>
        </div>
        <p className="x-live-call-empty-title">No active call</p>
        <p className="x-live-call-empty-hint">
          <kbd>⌘⇧D</kbd> start demo · <kbd>⌘⇧L</kbd> real capture
        </p>
      </div>
    )
  }

  return (
    <div className="x-live-call">
      <header className="x-live-call-header">
        <div className="x-live-call-header-main">
          <h2 className="x-live-call-title">{callTitle}</h2>
          {active ? (
            <span className="x-live-call-badge">
              <span className="x-live-call-pulse" aria-hidden />
              LIVE
            </span>
          ) : doneEvent ? (
            <span className="x-live-call-badge x-live-call-badge-done">ENDED</span>
          ) : null}
        </div>
        <div className="x-live-call-meta">
          {active && (
            <span className="x-live-call-elapsed">{formatElapsed(elapsed)}</span>
          )}
          <span className="x-live-call-source">Notch transcription</span>
        </div>
        {joinEvent?.meetingLink && active && (
          <button
            type="button"
            className="x-live-call-join"
            onClick={() => openMeeting(joinEvent.meetingLink!)}
          >
            Join Meet
          </button>
        )}
      </header>

      {assistEvents.length > 0 && (
        <div className="x-live-call-assists">
          {assistEvents.map((e) => (
            <div key={e.id} className="x-live-call-assist">
              {e.highlight && <span className="x-live-call-assist-tag">{e.highlight}</span>}
              <p className="x-live-call-assist-title">{e.title}</p>
              <p className="x-live-call-assist-body">{e.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="x-live-call-panel">
        <div className="x-live-call-lines" ref={scrollRef}>
          {lines.length === 0 ? (
            <p className="x-live-call-wait">Listening…</p>
          ) : (
            lines.map((line, i) => (
              <p
                key={line.id}
                className={`x-live-call-line ${i === lines.length - 1 && active ? 'x-live-call-line-new' : ''}`}
              >
                <span className="x-live-call-ts">{formatElapsed(line.ts - startTs)}</span>
                <span className="x-live-call-speaker">{line.speaker}</span>
                <span className="x-live-call-text">{line.text}</span>
              </p>
            ))
          )}
          {active && (
            <div className="x-live-call-cursor" aria-label="Transcribing">
              <span /><span /><span />
            </div>
          )}
        </div>
      </div>

      {doneEvent && (
        <div className="x-live-call-done">
          <p className="x-live-call-done-title">{doneEvent.title}</p>
          <p className="x-live-call-done-body">{doneEvent.body}</p>
          {doneEvent.highlight && (
            <span className="x-live-call-done-tag">{doneEvent.highlight}</span>
          )}
        </div>
      )}
    </div>
  )
}
