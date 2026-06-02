import { useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { LiveCallView } from './LiveTranscript'
import { PostCallTaskDeck } from './PostCallTaskDeck'
import { HomeChatLayout } from './HomeChatLayout'

const POST_CALL_STEPS = [
  'Wrapping up transcript…',
  'Extracting scope & next steps…',
  'Routing tasks…'
] as const

type Props = {
  events: CentralStreamEvent[]
  live: boolean
  syncing?: boolean
  focusMeetingItemId: string | null
  onFocusMeeting: (itemId: string | null) => void
  onRefresh?: () => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
  onSeeAllAgents?: () => void
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function meetingEvents(events: CentralStreamEvent[]): CentralStreamEvent[] {
  return events.filter((e) => e.source === 'meeting')
}

function isLiveCall(events: CentralStreamEvent[], streamLive: boolean): boolean {
  if (streamLive) return true
  return events.some((e) => e.kind === 'transcript_live')
}

function SyncDot({ syncing }: { syncing?: boolean }) {
  if (!syncing) return null
  return (
    <span className="x-sync-pulse" aria-live="polite">
      <span className="x-sync-pulse-dot" aria-hidden />
      Syncing
    </span>
  )
}

function PostCallProgress({ syncing }: { syncing?: boolean }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % POST_CALL_STEPS.length)
    }, 1800)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className="x-post-call-progress">
      <ul className="x-post-call-progress-steps">
        {POST_CALL_STEPS.map((label, i) => (
          <li
            key={label}
            className={`x-post-call-progress-step ${i === stepIndex ? 'x-post-call-progress-step-active' : i < stepIndex ? 'x-post-call-progress-step-done' : ''}`}
          >
            {label}
          </li>
        ))}
      </ul>
      <SyncDot syncing={syncing ?? true} />
    </div>
  )
}

export function WorkView({
  events,
  live: streamLive,
  syncing,
  focusMeetingItemId,
  onFocusMeeting,
  onRefresh,
  onOpenSearchHit,
  onSeeAllAgents
}: Props) {
  const [captureLive, setCaptureLive] = useState(false)

  const liveEvents = useMemo(
    () => events.filter((e) => ['transcript_live', 'assist', 'transcript_done'].includes(e.kind)),
    [events]
  )

  const meetings = useMemo(() => meetingEvents(events), [events])
  const focusEvent = useMemo(() => {
    if (!focusMeetingItemId) return null
    const bare = focusMeetingItemId.replace(/^ext-/, '')
    return meetings.find((e) => streamItemId(e) === bare) ?? null
  }, [focusMeetingItemId, meetings])

  const live = isLiveCall(events, streamLive) || captureLive

  useEffect(() => {
    const onStarted = window.notch?.meeting?.onStarted?.(() => setCaptureLive(true))
    const onEnded = window.notch?.meeting?.onEnded?.(() => {
      setCaptureLive(false)
      window.dispatchEvent(new Event('notch:engagements-updated'))
      onRefresh?.()
    })
    return () => {
      onStarted?.()
      onEnded?.()
    }
  }, [onRefresh])

  useEffect(() => {
    if (!focusMeetingItemId || focusEvent) return
    onRefresh?.()
    const onPush = () => onRefresh?.()
    window.addEventListener('notch:stream-push', onPush)
    return () => window.removeEventListener('notch:stream-push', onPush)
  }, [focusMeetingItemId, focusEvent, onRefresh])

  if (live) {
    return (
      <div className="x-work">
        <header className="x-work-header">
          <div>
            <p className="x-work-eyebrow">Live call</p>
            <h1 className="x-work-title">Client scoping</h1>
            <p className="x-work-sub">Mobile cluster is assisting · end call with ⌘⇧K</p>
          </div>
          <div className="x-work-header-status">
            <span className="x-work-live-pill">● LIVE</span>
            <SyncDot syncing={syncing} />
          </div>
        </header>
        <LiveCallView events={liveEvents} active={live} />
      </div>
    )
  }

  if (focusMeetingItemId) {
    if (!focusEvent) {
      return (
        <div className="x-work">
          <header className="x-work-header">
            <div>
              <p className="x-work-eyebrow">Post-call</p>
              <h1 className="x-work-title">Processing call</h1>
              <p className="x-work-sub">Extracting scope, next steps, and task routes</p>
            </div>
          </header>
          <PostCallProgress syncing={syncing} />
        </div>
      )
    }
    return (
      <div className="x-work">
        <PostCallTaskDeck
          event={focusEvent}
          onDismiss={() => onFocusMeeting(null)}
          onRefresh={onRefresh}
        />
      </div>
    )
  }

  const openMeeting = (itemId: string) => onFocusMeeting(itemId)

  return (
    <div className="x-work-portal-wrap x-work-home">
      <HomeChatLayout
        events={events}
        liveCapture={false}
        onFocusMeeting={openMeeting}
        onOpenSearchHit={onOpenSearchHit}
        onSeeAllAgents={onSeeAllAgents}
      />
    </div>
  )
}
