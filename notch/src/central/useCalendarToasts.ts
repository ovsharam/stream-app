import { useCallback, useEffect } from 'react'
import type { CalendarRailEvent } from '@shared/cluster'
import { clusterApi } from '../lib/api'
import { pushAppToast } from './appToastStore'
import { tabFromCalendarEvent } from './workspace'

type MeetingThreshold = 'live' | '5m' | '15m'

const THRESHOLD_TITLES: Record<MeetingThreshold, string> = {
  live: 'Starting now',
  '5m': 'In 5 minutes',
  '15m': 'In 15 minutes'
}

/** Persisted in localStorage — survives Notch restarts for the calendar day. */
function sessionKey(eventId: string, threshold: MeetingThreshold): string {
  const day = new Date().toISOString().slice(0, 10)
  return `notch.toast.meeting.${day}.${eventId}.${threshold}`
}

function wasFired(eventId: string, threshold: MeetingThreshold): boolean {
  try {
    return localStorage.getItem(sessionKey(eventId, threshold)) === '1'
  } catch {
    return false
  }
}

function markFired(eventId: string, threshold: MeetingThreshold): void {
  try {
    localStorage.setItem(sessionKey(eventId, threshold), '1')
  } catch {
    /* ignore */
  }
}

function openExternal(url: string): void {
  if (window.notchDesktop?.openExternal) window.notchDesktop.openExternal(url)
  else window.open(url, '_blank', 'noopener,noreferrer')
}

function thresholdForEvent(evt: CalendarRailEvent, now: number): MeetingThreshold | null {
  if (evt.ended || now >= evt.endsAt) return null

  const startsIn = evt.startsAt - now
  const isLive = evt.live || (evt.startsAt <= now && now < evt.endsAt)
  if (isLive) return 'live'
  if (startsIn > 0 && startsIn <= 5 * 60_000) return '5m'
  if (startsIn > 5 * 60_000 && startsIn <= 15 * 60_000) return '15m'
  return null
}

function pushMeetingToast(evt: CalendarRailEvent, threshold: MeetingThreshold): void {
  const urgency = threshold === 'live' || threshold === '5m' ? 'high' : 'normal'
  const tab = tabFromCalendarEvent(evt)
  const actions: Parameters<typeof pushAppToast>[0]['actions'] = []

  if (evt.link) {
    actions.push({
      label: 'Join',
      primary: true,
      onClick: () => openExternal(evt.link!)
    })
  }

  if (tab) {
    actions.push({
      label: 'Open',
      primary: !evt.link,
      onClick: () => {
        window.dispatchEvent(
          new CustomEvent('notch:open-workspace', {
            detail: {
              url: tab.url,
              title: tab.title,
              source: tab.source,
              summary: tab.summary,
              id: tab.id,
              tabKind: 'temp',
              activate: true
            }
          })
        )
      }
    })
  }

  const expiresAt =
    threshold === 'live'
      ? evt.endsAt
      : threshold === '5m'
        ? evt.startsAt
        : Date.now() + 3 * 60_000

  const title = evt.title.length > 56 ? `${evt.title.slice(0, 53)}…` : evt.title

  pushAppToast({
    kind: 'meeting',
    title: THRESHOLD_TITLES[threshold],
    subtitle: `${title} — ${evt.timeLabel}`,
    urgency,
    dedupeKey: `meeting-${evt.id}-${threshold}`,
    expiresAt,
    actions
  })
}

function scanCalendarEvents(events: CalendarRailEvent[]): void {
  const now = Date.now()
  for (const evt of events) {
    const threshold = thresholdForEvent(evt, now)
    if (!threshold || wasFired(evt.id, threshold)) continue
    markFired(evt.id, threshold)
    pushMeetingToast(evt, threshold)
  }
}

export function useCalendarToasts(): void {
  const poll = useCallback(async () => {
    try {
      const data = await clusterApi.calendar()
      scanCalendarEvents(data.events ?? [])
    } catch {
      /* calendar optional */
    }
  }, [])

  useEffect(() => {
    void poll()
    const interval = window.setInterval(() => void poll(), 30_000)
    const onCalendarsUpdated = () => void poll()
    window.addEventListener('notch:calendars-updated', onCalendarsUpdated)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('notch:calendars-updated', onCalendarsUpdated)
    }
  }, [poll])
}
