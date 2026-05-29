import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { CalendarRailEvent, PerplexityNewsItem } from '@shared/cluster'
import { clusterApi, openExternal, openMeeting } from '../lib/api'
import { IconVideoCall } from './Icons'

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

function splitTimeLabel(label: string): { start: string; end: string } {
  const parts = label.split(/\s*[–—-]\s*/)
  if (parts.length >= 2) {
    return { start: parts[0].trim(), end: parts[1].trim() }
  }
  return { start: label.trim(), end: '' }
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

function CalendarEvent({ event }: { event: CalendarRailEvent }) {
  const palette = eventPalette(event)
  const { start, end } = splitTimeLabel(event.timeLabel)
  const isMeet = event.kind === 'meet' && Boolean(event.link)
  const clickable = isMeet || Boolean(event.link)

  const open = () => {
    if (event.link) openMeeting(event.link)
  }

  return (
    <li
      className={`x-cal-event ${event.live ? 'x-cal-event-live' : ''} ${event.ended ? 'x-cal-event-ended' : ''} ${clickable ? 'x-cal-event-clickable' : ''}`}
      style={
        {
          '--cal-accent': palette.accent,
          '--cal-bg': palette.bg
        } as CSSProperties
      }
    >
      <button
        type="button"
        className="x-cal-event-body"
        disabled={!clickable}
        onClick={() => clickable && open()}
      >
        <p className="x-cal-event-time">
          {start}
          {end ? ` – ${end}` : ''}
        </p>
        <p className="x-cal-event-title">
          {event.live && <span className="x-cal-event-now">Now</span>}
          {event.title}
        </p>
        <p className="x-cal-event-meta">
          {event.durationLabel}
          {isMeet && (
            <>
              <span className="x-cal-event-dot" aria-hidden>
                ·
              </span>
              <IconVideoCall className="x-cal-event-meet-icon" />
              <span>Meet</span>
            </>
          )}
        </p>
      </button>
      {isMeet && (
        <button
          type="button"
          className="x-cal-event-meet-btn"
          aria-label={`Join ${event.title}`}
          title="Join Google Meet"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
        >
          <IconVideoCall className="x-cal-event-meet-btn-icon" />
        </button>
      )}
    </li>
  )
}

function PerplexityNewsCard({ item }: { item: PerplexityNewsItem }) {
  const open = () => {
    if (item.url) openExternal(item.url)
  }

  return (
    <li className="x-pplx-news-item">
      <button type="button" className="x-pplx-news-body" onClick={() => item.url && open()}>
        <p className="x-pplx-news-title">{item.title}</p>
        <p className="x-pplx-news-summary">{item.summary}</p>
      </button>
    </li>
  )
}

function MindRail() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<{
    datapoints: number
    entities: number
    traces: number
    recent: { id: string; excerpt: string; intention: string; ingestedAt: number }[]
  } | null>(null)

  const loadStats = async () => {
    try {
      setStats(await clusterApi.kbStats())
    } catch {
      setStats(null)
    }
  }

  useEffect(() => {
    void loadStats()
    const onMind = () => void loadStats()
    window.addEventListener('notch:mind-updated', onMind)
    return () => window.removeEventListener('notch:mind-updated', onMind)
  }, [])

  const save = async () => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await clusterApi.kbStream(trimmed)
      setText('')
      await loadStats()
      window.dispatchEvent(new Event('notch:mind-updated'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="x-mind-rail">
      <div className="x-cal-head x-mind-head">
        <h2>Mind</h2>
        <p className="x-cal-sub">Stream → knowledge graph</p>
      </div>
      <textarea
        className="x-mind-input"
        rows={3}
        value={text}
        placeholder="Learning, plans, reflections… #topics [[concepts]]"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void save()
          }
        }}
      />
      <div className="x-mind-actions">
        <button type="button" className="x-mind-save" disabled={!text.trim() || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save to graph'}
        </button>
        {stats && (
          <span className="x-mind-stats">
            {stats.datapoints} dp · {stats.entities} ent · {stats.traces} traces
          </span>
        )}
      </div>
      {stats && stats.recent.length > 0 && (
        <ul className="x-mind-recent">
          {stats.recent.map((item) => (
            <li key={item.id} className="x-mind-recent-item">
              <span className="x-mind-intent">{item.intention}</span>
              <p>{item.excerpt}{item.excerpt.length >= 120 ? '…' : ''}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="x-mind-hint">Or compose <code>@mind …</code> in the feed. Feed clicks record time-to-action.</p>
    </div>
  )
}

export function RailWidgets() {
  const [meetings, setMeetings] = useState<CalendarRailEvent[]>([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarHint, setCalendarHint] = useState<string | null>(null)
  const [pplxNews, setPplxNews] = useState<PerplexityNewsItem[]>([])
  const [pplxConnected, setPplxConnected] = useState(false)
  const [pplxHint, setPplxHint] = useState<string | null>(null)

  const dayGroups = useMemo(() => groupByDay(meetings), [meetings])

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
    <div className="x-widget x-widget-calendar">
      <div className="x-cal-head">
        <h2>Calendar</h2>
        <p className="x-cal-sub">Next 3 days</p>
      </div>
      {!calendarConnected ? (
        <p className="x-cal-empty">Connect Gmail in Settings to sync Google Calendar.</p>
      ) : dayGroups.length === 0 ? (
        <p className="x-cal-empty">{calendarHint ?? 'Nothing scheduled in the next 3 days.'}</p>
      ) : (
        <div className="x-cal-days">
          {dayGroups.map((group) => (
            <section key={group.dayIndex} className="x-cal-day">
              <h3
                className={`x-cal-day-title ${group.dayIndex === 0 ? 'x-cal-day-title-today' : ''}`}
              >
                {group.dayIndex === 0 && <span className="x-cal-day-dot" aria-hidden />}
                {group.heading}
              </h3>
              <ul className="x-cal-events">
                {group.events.map((m) => (
                  <CalendarEvent key={m.id} event={m} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="x-pplx-rail">
        <div className="x-cal-head x-pplx-head">
          <h2>Perplexity News</h2>
          <p className="x-cal-sub">Last 24h · live research</p>
        </div>
        {!pplxConnected ? (
          <p className="x-cal-empty">{pplxHint ?? 'Connect Perplexity in Integrations for news in the rail.'}</p>
        ) : pplxNews.length === 0 ? (
          <p className="x-cal-empty">{pplxHint ?? 'Fetching headlines…'}</p>
        ) : (
          <ul className="x-pplx-news-list">
            {pplxNews.map((item) => (
              <PerplexityNewsCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>

      <MindRail />
    </div>
  )
}
