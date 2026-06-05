import { useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { LiveCallView } from './LiveTranscript'
import { HomeChatLayout } from './HomeChatLayout'

type Props = {
  events: CentralStreamEvent[]
  live: boolean
  syncing?: boolean
  onFocusMeeting: (itemId: string | null) => void
  onRefresh?: () => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
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

export function WorkView({
  events,
  live: streamLive,
  syncing,
  onFocusMeeting,
  onRefresh,
  onOpenSearchHit
}: Props) {
  const [captureLive, setCaptureLive] = useState(false)

  const liveEvents = useMemo(
    () => events.filter((e) => ['transcript_live', 'assist', 'transcript_done'].includes(e.kind)),
    [events]
  )

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

  return (
    <div className="x-work-portal-wrap x-work-home">
      <HomeChatLayout
        events={events}
        liveCapture={false}
        onFocusMeeting={(itemId) => onFocusMeeting(itemId)}
        onOpenSearchHit={onOpenSearchHit}
      />
    </div>
  )
}
