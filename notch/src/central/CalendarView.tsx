import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { CalendarRailEvent, PerplexityNewsItem } from '@shared/cluster'
import { clusterApi, openMeeting } from '../lib/api'
import { IconVideoCall } from './Icons'
import './calendar.css'

const CAL_PALETTE = [
  { accent: '#1a73e8', bg: 'rgba(26, 115, 232, 0.14)' },
  { accent: '#0b8043', bg: 'rgba(11, 128, 67, 0.14)' },
  { accent: '#e37400', bg: 'rgba(227, 116, 0, 0.14)' },
  { accent: '#9334e6', bg: 'rgba(147, 52, 230, 0.14)' },
  { accent: '#d50000', bg: 'rgba(213, 0, 0, 0.12)' },
  { accent: '#00897b', bg: 'rgba(0, 137, 123, 0.14)' },
  { accent: '#c5221f', bg: 'rgba(197, 34, 31, 0.12)' },
  { accent: '#1967d2', bg: 'rgba(25, 103, 210, 0.14)' }
] as const

const HOUR_HEIGHT = 48
const PX_PER_MIN = HOUR_HEIGHT / 60
const DEFAULT_GRID_START = 6
const DEFAULT_GRID_END = 22
const MIN_EVENT_HEIGHT = 22

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime()
}

function isToday(date: Date): boolean {
  return isSameLocalDay(date, new Date())
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function eventPalette(evt: CalendarRailEvent) {
  if (evt.live) {
    return { accent: '#0b8043', bg: 'rgba(11, 128, 67, 0.2)' }
  }
  if (evt.ended) {
    return { accent: '#80868b', bg: 'rgba(128, 134, 139, 0.12)' }
  }
  let hash = 0
  for (let i = 0; i < evt.title.length; i += 1) {
    hash = evt.title.charCodeAt(i) + ((hash << 5) - hash)
  }
  return CAL_PALETTE[Math.abs(hash) % CAL_PALETTE.length]
}

function minutesUntil(ts: number): number {
  return Math.max(0, Math.round((ts - Date.now()) / 60_000))
}

function formatCountdown(event: CalendarRailEvent): string | null {
  if (event.live) return 'Happening now'
  if (event.ended) return null
  const mins = minutesUntil(event.startsAt)
  if (mins <= 0) return 'Starting now'
  if (mins < 60) return `In ${mins} min`
  const hours = Math.floor(mins / 60)
  const rem = mins % 60
  if (rem === 0) return `In ${hours}h`
  return `In ${hours}h ${rem}m`
}

function findSpotlightEvent(events: CalendarRailEvent[]): CalendarRailEvent | null {
  const live = events.find((e) => e.live)
  if (live) return live
  const upcoming = events
    .filter((e) => !e.ended && !e.live && e.startsAt >= Date.now() - 5 * 60_000)
    .sort((a, b) => a.startsAt - b.startsAt)
  return upcoming[0] ?? null
}

function eventsForDay(allEvents: CalendarRailEvent[], day: Date): CalendarRailEvent[] {
  return allEvents
    .filter((evt) => isSameLocalDay(new Date(evt.startsAt), day))
    .sort((a, b) => a.startsAt - b.startsAt)
}

function splitTimeLabel(label: string): { start: string; end: string } {
  const parts = label.split(/\s*[–—-]\s*/)
  if (parts.length >= 2) {
    return { start: parts[0].trim(), end: parts[1].trim() }
  }
  return { start: label.trim(), end: '' }
}

function formatHourLabel(hour: number): string {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric' })
}

type LayoutSlot = {
  event: CalendarRailEvent
  column: number
  columnCount: number
}

function layoutOverlappingEvents(events: CalendarRailEvent[]): LayoutSlot[] {
  if (events.length === 0) return []
  const sorted = [...events].sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)
  const columnEnds: number[] = []
  const placed: Array<{ event: CalendarRailEvent; column: number }> = []

  for (const event of sorted) {
    let column = columnEnds.findIndex((end) => end <= event.startsAt)
    if (column === -1) {
      column = columnEnds.length
      columnEnds.push(event.endsAt)
    } else {
      columnEnds[column] = event.endsAt
    }
    placed.push({ event, column })
  }

  return placed.map(({ event, column }) => {
    const overlapping = placed.filter(
      (o) => o.event.startsAt < event.endsAt && o.event.endsAt > event.startsAt
    )
    const columnCount = Math.max(...overlapping.map((o) => o.column), column) + 1
    return { event, column, columnCount }
  })
}

function computeGridBounds(events: CalendarRailEvent[]): { startHour: number; endHour: number } {
  let startHour = DEFAULT_GRID_START
  let endHour = DEFAULT_GRID_END

  for (const evt of events) {
    const start = new Date(evt.startsAt)
    const end = new Date(evt.endsAt)
    startHour = Math.min(startHour, Math.max(0, start.getHours() - (start.getMinutes() > 0 ? 0 : 1)))
    endHour = Math.max(endHour, end.getHours() + (end.getMinutes() > 0 ? 2 : 1))
  }

  startHour = Math.max(0, Math.min(startHour, 23))
  endHour = Math.max(startHour + 1, Math.min(endHour, 24))
  return { startHour, endHour }
}

function buildWeekStrip(viewDate: Date, allEvents: CalendarRailEvent[]) {
  const today = startOfLocalDay(new Date())
  const viewStart = addDays(today, -3)
  return Array.from({ length: 7 }, (_, idx) => {
    const d = addDays(viewStart, idx)
    const count = eventsForDay(allEvents, d).length
    return {
      date: d,
      weekday: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      dayNum: d.getDate(),
      count,
      isToday: isSameLocalDay(d, today),
      isActive: isSameLocalDay(d, viewDate)
    }
  })
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CalendarSpotlight({ event }: { event: CalendarRailEvent }) {
  const palette = eventPalette(event)
  const countdown = formatCountdown(event)
  const isMeet = event.kind === 'meet' && Boolean(event.link)
  const open = () => {
    if (event.link) openMeeting(event.link)
  }

  return (
    <article
      className={`x-cal-spotlight ${event.live ? 'x-cal-spotlight-live' : ''}`}
      style={
        {
          '--cal-accent': palette.accent,
          '--cal-bg': palette.bg
        } as CSSProperties
      }
    >
      <div className="x-cal-spotlight-head">
        <span className="x-cal-spotlight-label">{event.live ? 'Now' : 'Up next'}</span>
        {countdown ? <span className="x-cal-spotlight-countdown">{countdown}</span> : null}
      </div>
      <h3 className="x-cal-spotlight-title">{event.title}</h3>
      <p className="x-cal-spotlight-time">
        {event.timeLabel}
        <span className="x-cal-spotlight-dot" aria-hidden>
          ·
        </span>
        {event.durationLabel}
      </p>
      {isMeet ? (
        <button type="button" className="x-cal-spotlight-join" onClick={open}>
          <IconVideoCall className="x-cal-spotlight-join-icon" />
          Join Meet
        </button>
      ) : event.link ? (
        <button type="button" className="x-cal-spotlight-join x-cal-spotlight-open" onClick={open}>
          Open event
        </button>
      ) : null}
    </article>
  )
}

function CalendarDayStrip({
  days,
  onSelect
}: {
  days: ReturnType<typeof buildWeekStrip>
  onSelect: (date: Date) => void
}) {
  return (
    <div className="x-cal-strip" role="tablist" aria-label="Select day">
      {days.map((day) => (
        <button
          key={day.date.toISOString()}
          type="button"
          role="tab"
          aria-selected={day.isActive}
          aria-label={day.date.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
          className={`x-cal-strip-day${day.isToday ? ' x-cal-strip-day-today' : ''}${day.isActive ? ' x-cal-strip-day-active' : ''}`}
          onClick={() => onSelect(day.date)}
        >
          <span className="x-cal-strip-weekday">{day.weekday}</span>
          <span className="x-cal-strip-date">{day.dayNum}</span>
          {day.count > 0 && !day.isActive ? <span className="x-cal-strip-dot" aria-hidden /> : null}
        </button>
      ))}
    </div>
  )
}

function CalendarTimeGrid({
  dayEvents,
  viewDate,
  nowMarkerRef
}: {
  dayEvents: CalendarRailEvent[]
  viewDate: Date
  nowMarkerRef?: RefObject<HTMLDivElement | null>
}) {
  const [, tick] = useState(0)
  const showingToday = isToday(viewDate)
  const { startHour, endHour } = useMemo(() => computeGridBounds(dayEvents), [dayEvents])
  const totalHours = endHour - startHour
  const gridHeight = totalHours * HOUR_HEIGHT
  const dayStartMs = startOfLocalDay(viewDate).getTime() + startHour * 3_600_000
  const layouts = useMemo(() => layoutOverlappingEvents(dayEvents), [dayEvents])

  useEffect(() => {
    if (!showingToday) return
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [showingToday])

  const nowTop = useMemo(() => {
    if (!showingToday) return null
    const now = Date.now()
    const dayEndMs = startOfLocalDay(viewDate).getTime() + endHour * 3_600_000
    if (now < dayStartMs || now > dayEndMs) return null
    return ((now - dayStartMs) / 60_000) * PX_PER_MIN
  }, [showingToday, viewDate, startHour, endHour, tick])

  const hourMarks = useMemo(() => {
    const marks: number[] = []
    for (let h = startHour; h <= endHour; h += 1) marks.push(h)
    return marks
  }, [startHour, endHour])

  if (dayEvents.length === 0) {
    return (
      <div className="x-cal-grid-empty">
        {showingToday ? 'Nothing else on your calendar today.' : 'No events scheduled.'}
      </div>
    )
  }

  return (
    <div className="x-cal-grid-wrap">
      <div className="x-cal-grid" style={{ height: gridHeight }}>
        <div className="x-cal-grid-hours" style={{ height: gridHeight }}>
          {hourMarks.map((hour) => (
            <span
              key={hour}
              className="x-cal-grid-hour-label"
              style={{ top: (hour - startHour) * HOUR_HEIGHT }}
            >
              {hour < endHour ? formatHourLabel(hour) : ''}
            </span>
          ))}
        </div>
        <div className="x-cal-grid-canvas" style={{ height: gridHeight }}>
          {hourMarks.map((hour) => (
            <span
              key={`line-${hour}`}
              className="x-cal-grid-line"
              style={{ top: (hour - startHour) * HOUR_HEIGHT }}
            />
          ))}
          {hourMarks.slice(0, -1).map((hour) => (
            <span
              key={`half-${hour}`}
              className="x-cal-grid-line x-cal-grid-line-half"
              style={{ top: (hour - startHour) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
            />
          ))}

          {nowTop != null ? (
            <div
              ref={nowMarkerRef}
              className="x-cal-now-marker"
              style={{ top: nowTop }}
              aria-hidden
            >
              <span className="x-cal-now-dot" />
              <span className="x-cal-now-line" />
            </div>
          ) : null}

          {layouts.map(({ event, column, columnCount }) => {
            const palette = eventPalette(event)
            const top = ((event.startsAt - dayStartMs) / 60_000) * PX_PER_MIN
            const height = Math.max(
              MIN_EVENT_HEIGHT,
              ((event.endsAt - event.startsAt) / 60_000) * PX_PER_MIN
            )
            const widthPct = 100 / columnCount
            const leftPct = column * widthPct
            const isMeet = event.kind === 'meet' && Boolean(event.link)
            const clickable = isMeet || Boolean(event.link)
            const { start } = splitTimeLabel(event.timeLabel)
            const showTime = height >= 36
            const showMeet = height >= 48 && isMeet

            const open = () => {
              if (event.link) openMeeting(event.link)
            }

            return (
              <div
                key={event.id}
                className={`x-cal-event ${event.live ? 'x-cal-event-live' : ''} ${event.ended ? 'x-cal-event-ended' : ''} ${clickable ? 'x-cal-event-clickable' : ''}`}
                style={
                  {
                    top,
                    height,
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    '--cal-accent': palette.accent,
                    '--cal-bg': palette.bg
                  } as CSSProperties
                }
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? open : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          open()
                        }
                      }
                    : undefined
                }
              >
                <p className="x-cal-event-title">
                  {event.live ? <span className="x-cal-event-live-pill">Live</span> : null}
                  {event.title}
                </p>
                {showTime ? <p className="x-cal-event-time">{start}</p> : null}
                {showMeet ? (
                  <span className="x-cal-event-meet">
                    <IconVideoCall className="x-cal-event-meet-icon" />
                    Meet
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function useCalendarRail() {
  const [meetings, setMeetings] = useState<CalendarRailEvent[]>([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarHint, setCalendarHint] = useState<string | null>(null)
  const [pplxNews, setPplxNews] = useState<PerplexityNewsItem[]>([])
  const [pplxConnected, setPplxConnected] = useState(false)
  const [pplxHint, setPplxHint] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await clusterApi.calendar()
        setMeetings(data.events)
        setCalendarConnected(data.connected)
        setPplxNews(data.perplexity?.news ?? [])
        setPplxConnected(data.perplexity?.connected ?? false)
        if (data.perplexity?.error) {
          setPplxHint('News sync issue — check Perplexity in Integrations.')
        } else if (data.perplexity?.connected && (data.perplexity.news?.length ?? 0) === 0) {
          setPplxHint('Connect Perplexity to stream headlines here.')
        } else {
          setPplxHint(null)
        }
        if (data.needsReconnect) {
          setCalendarHint('Reconnect Gmail in Settings to grant Calendar access.')
        } else if (data.error) {
          setCalendarHint(`Calendar sync issue: ${data.error}`)
        } else if (data.connected && data.events.length === 0) {
          setCalendarHint('Nothing scheduled.')
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

  return {
    events: meetings,
    calendarConnected,
    calendarHint,
    pplxNews,
    pplxConnected,
    pplxHint
  }
}

export function CalendarPanel({
  allEvents,
  calendarConnected,
  calendarHint
}: {
  allEvents: CalendarRailEvent[]
  calendarConnected: boolean
  calendarHint: string | null
}) {
  const [viewDate, setViewDate] = useState(() => startOfLocalDay(new Date()))
  const nowMarkerRef = useRef<HTMLDivElement>(null)
  const scrolledRef = useRef(false)

  const dayEvents = useMemo(() => eventsForDay(allEvents, viewDate), [allEvents, viewDate])
  const stripDays = useMemo(() => buildWeekStrip(viewDate, allEvents), [viewDate, allEvents])
  const spotlight = useMemo(
    () => (isToday(viewDate) ? findSpotlightEvent(allEvents) : null),
    [allEvents, viewDate]
  )

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const dayLabel = viewDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  })
  const viewingToday = isToday(viewDate)

  const goPrev = useCallback(() => setViewDate((d) => addDays(d, -1)), [])
  const goNext = useCallback(() => setViewDate((d) => addDays(d, 1)), [])
  const goToday = useCallback(() => setViewDate(startOfLocalDay(new Date())), [])

  const selectDay = useCallback((date: Date) => setViewDate(startOfLocalDay(date)), [])

  useEffect(() => {
    scrolledRef.current = false
  }, [viewDate])

  useEffect(() => {
    if (!viewingToday || scrolledRef.current) return
    const marker = nowMarkerRef.current
    if (!marker) return
    requestAnimationFrame(() => {
      marker.scrollIntoView({ block: 'center', behavior: 'smooth' })
      scrolledRef.current = true
    })
  }, [viewingToday, dayEvents])

  return (
    <div className="x-rail-tab-body x-cal-view">
      <header className="x-cal-view-header">
        <div className="x-cal-view-header-top">
          <h2 className="x-cal-view-month">{monthLabel}</h2>
          {calendarConnected ? <span className="x-cal-sync-badge">Synced</span> : null}
        </div>
        <div className="x-cal-view-nav">
          <button type="button" className="x-cal-view-nav-btn" aria-label="Previous day" onClick={goPrev}>
            <IconChevronLeft />
          </button>
          <button
            type="button"
            className={`x-cal-view-today-btn${viewingToday ? ' x-cal-view-today-btn-active' : ''}`}
            onClick={goToday}
            disabled={viewingToday}
          >
            Today
          </button>
          <button type="button" className="x-cal-view-nav-btn" aria-label="Next day" onClick={goNext}>
            <IconChevronRight />
          </button>
        </div>
        <div className="x-cal-view-header-bottom">
          <div>
            <p className={`x-cal-view-day-label${viewingToday ? ' x-cal-view-day-label-today' : ''}`}>
              {dayLabel}
            </p>
            <p className="x-cal-view-sub">Google Calendar + Cal.com</p>
          </div>
        </div>
      </header>

      {!calendarConnected ? (
        <p className="x-cal-empty">Connect Gmail or Cal.com in Apps to sync your schedule.</p>
      ) : allEvents.length === 0 ? (
        <p className="x-cal-empty">{calendarHint ?? 'Nothing scheduled.'}</p>
      ) : (
        <>
          <CalendarDayStrip days={stripDays} onSelect={selectDay} />
          {spotlight ? <CalendarSpotlight event={spotlight} /> : null}
          <CalendarTimeGrid
            dayEvents={dayEvents}
            viewDate={viewDate}
            nowMarkerRef={nowMarkerRef}
          />
        </>
      )}
    </div>
  )
}
