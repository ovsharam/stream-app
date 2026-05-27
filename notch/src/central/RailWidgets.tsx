import { useEffect, useMemo, useState } from 'react'
import type { CalendarRailEvent } from '@shared/cluster'
import { clusterApi, openMeeting } from '../lib/api'

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function resolveDayIndex(evt: CalendarRailEvent): number {
  if (typeof evt.dayIndex === 'number' && evt.dayIndex >= 0) return evt.dayIndex
  const now = new Date()
  const today = startOfLocalDay(now).getTime()
  const day = startOfLocalDay(new Date(evt.startsAt)).getTime()
  return Math.round((day - today) / 86_400_000)
}

function resolveDayHeading(index: number): string {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  const d = new Date()
  d.setDate(d.getDate() + index)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function groupByDay(events: CalendarRailEvent[]): { heading: string; dayIndex: number; events: CalendarRailEvent[] }[] {
  const order = [0, 1, 2]
  const buckets = new Map<number, CalendarRailEvent[]>()

  for (const evt of events) {
    const dayIndex = resolveDayIndex(evt)
    if (dayIndex < 0 || dayIndex > 2) continue
    const list = buckets.get(dayIndex) ?? []
    list.push(evt)
    buckets.set(dayIndex, list)
  }

  return order
    .filter((idx) => (buckets.get(idx)?.length ?? 0) > 0)
    .map((idx) => ({
      dayIndex: idx,
      heading: buckets.get(idx)![0].dayHeading || resolveDayHeading(idx),
      events: buckets.get(idx)!.sort((a, b) => a.startsAt - b.startsAt)
    }))
}

export function RailWidgets() {
  const [meetings, setMeetings] = useState<CalendarRailEvent[]>([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarHint, setCalendarHint] = useState<string | null>(null)

  const dayGroups = useMemo(() => groupByDay(meetings), [meetings])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await clusterApi.calendar()
        setMeetings(data.events)
        setCalendarConnected(data.connected)
        if (data.needsReconnect) {
          setCalendarHint('Reconnect Gmail in Settings to grant Calendar access.')
        } else if (data.error) {
          setCalendarHint(`Calendar sync issue: ${data.error}`)
        } else if (data.connected && data.events.length === 0) {
          setCalendarHint('Nothing scheduled in the next 3 days.')
        } else {
          setCalendarHint(null)
        }
      } catch {
        setMeetings([])
        setCalendarConnected(false)
        setCalendarHint('Could not reach the calendar API.')
      }
    }
    void load()
    const interval = setInterval(() => void load(), 15000)
    const onCalendarsUpdated = () => void load()
    window.addEventListener('notch:calendars-updated', onCalendarsUpdated)
    return () => {
      clearInterval(interval)
      window.removeEventListener('notch:calendars-updated', onCalendarsUpdated)
    }
  }, [])

  return (
    <>
      <div className="x-widget x-widget-calendar">
        <h2>Calendar</h2>
        {!calendarConnected ? (
          <p className="x-cal-empty">Connect Gmail in Settings to sync Google Calendar.</p>
        ) : dayGroups.length === 0 ? (
          <p className="x-cal-empty">{calendarHint ?? 'Nothing scheduled in the next 3 days.'}</p>
        ) : (
          <div className="x-cal-days">
            {dayGroups.map((group) => (
              <section key={group.dayIndex} className="x-cal-day">
                <h3 className="x-cal-day-title">{group.heading}</h3>
                <ul className="x-cal-list">
                  {group.events.map((m) => (
                    <li key={m.id} className="x-cal-item x-cal-item-compact">
                      <span className="x-cal-time-label">{m.timeLabel}</span>
                      <div className="x-cal-body">
                        <p className="x-cal-title">
                          {m.live && <span className="x-cal-live">LIVE</span>}
                          {m.title}
                        </p>
                        {m.kind === 'meet' && m.link && (
                          <button type="button" className="x-cal-join" onClick={() => openMeeting(m.link!)}>
                            Join
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
