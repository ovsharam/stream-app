import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { CalendarRailEvent, CentralStreamEvent, PerplexityNewsItem } from '@shared/cluster'
import { cleanKbExcerpt } from '@shared/assistText'
import { clusterApi, openExternal, openMeeting } from '../lib/api'
import { FeedRailChatPanel } from './FeedRailChatPanel'
import { AgentInboxPanel } from './AgentInboxPanel'
import { useAgentPendingCount } from './useAgentPendingCount'
import { FeedRailStreamPanel } from './FeedRailStreamPanel'
import type { ComposeMentionTarget } from '@shared/compose'
import { IconGmail, IconMonday, IconSettings, IconVideoCall } from './Icons'
import { RailWidgetsConfigSheet } from './RailWidgetsConfig'
import {
  getVisibleWidgets,
  useRailWidgets,
  widgetLabel,
  type RailContext,
  type RailWidgetId
} from './railWidgetsStore'

type RailTab = RailWidgetId
type IntentionFilter = 'all' | 'plan' | 'explore' | 'execute'

type RecentItem = {
  id: string
  excerpt: string
  intention: string
  kind?: string
  source?: string
  ingestedAt: number
}

const INTENTION_FILTERS: { id: IntentionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'plan', label: 'Plan' },
  { id: 'explore', label: 'Explore' },
  { id: 'execute', label: 'Execute' }
]

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

function splitDayEvents(events: CalendarRailEvent[]): {
  earlierToday: CalendarRailEvent[]
  upNext: CalendarRailEvent[]
} {
  const earlierToday = events.filter((e) => e.ended).sort((a, b) => a.startsAt - b.startsAt)
  const upNext = events.filter((e) => !e.ended).sort((a, b) => a.startsAt - b.startsAt)
  return { earlierToday, upNext }
}

function buildDayStrip(dayGroups: ReturnType<typeof groupByDay>) {
  return [0, 1, 2].map((idx) => {
    const d = new Date()
    d.setDate(d.getDate() + idx)
    const count = dayGroups.find((g) => g.dayIndex === idx)?.events.length ?? 0
    return {
      dayIndex: idx,
      weekday: idx === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' }),
      date: d.getDate(),
      month: d.toLocaleDateString(undefined, { month: 'short' }),
      count
    }
  })
}

function agendaWithNowMarker(
  events: CalendarRailEvent[],
  isToday: boolean
): Array<{ type: 'event'; event: CalendarRailEvent } | { type: 'now' }> {
  if (!isToday) return events.map((event) => ({ type: 'event', event }))
  const now = Date.now()
  const out: Array<{ type: 'event'; event: CalendarRailEvent } | { type: 'now' }> = []
  let inserted = false
  for (let i = 0; i < events.length; i += 1) {
    const evt = events[i]
    const prevEnd = i > 0 ? events[i - 1].endsAt : 0
    if (!inserted && now >= prevEnd && now < evt.startsAt) {
      out.push({ type: 'now' })
      inserted = true
    }
    out.push({ type: 'event', event: evt })
  }
  if (!inserted && events.length > 0 && now >= events[events.length - 1].endsAt) {
    out.push({ type: 'now' })
  }
  return out
}

function formatDaySectionTitle(dayIndex: number, heading: string): string {
  if (dayIndex === 0) return 'Today'
  if (dayIndex === 1) return 'Tomorrow'
  return heading
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
  const buckets = new Map<number, CalendarRailEvent[]>()

  for (const evt of events) {
    const dayIndex = resolveDayIndex(evt)
    if (dayIndex < 0) continue
    const list = buckets.get(dayIndex) ?? []
    list.push(evt)
    buckets.set(dayIndex, list)
  }

  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .map((idx) => ({
      dayIndex: idx,
      heading: buckets.get(idx)![0].dayHeading || resolveDayHeading(idx),
      events: buckets.get(idx)!.sort((a, b) => a.startsAt - b.startsAt)
    }))
}

function normalizeIntention(intention: string): IntentionFilter | null {
  const key = intention.toLowerCase()
  if (key === 'plan' || key === 'explore' || key === 'execute') return key
  return null
}

const SOURCE_AVATAR: Record<string, { bg: string; color: string; label: string }> = {
  notch: { bg: '#0f1419', color: '#fff', label: 'N' },
  meeting: { bg: '#00897b', color: '#fff', label: '✦' },
  mobile: { bg: '#536471', color: '#fff', label: 'C' },
  mind: { bg: '#1d9bf0', color: '#fff', label: 'M' },
  slack: { bg: '#611f69', color: '#fff', label: 'S' },
  x: { bg: '#111', color: '#fff', label: 'X' },
  discord: { bg: '#5865f2', color: '#fff', label: 'D' },
  github: { bg: '#24292f', color: '#fff', label: 'GH' },
  gdocs: { bg: '#4285F4', color: '#fff', label: 'Gd' },
  gong: { bg: '#7c3aed', color: '#fff', label: 'Go' },
  salesforce: { bg: '#0176d3', color: '#fff', label: 'SF' },
  perplexity: { bg: '#20b8cd', color: '#fff', label: 'P' },
  insight: { bg: '#536471', color: '#fff', label: '✦' }
}

const SOURCE_LABELS: Record<string, string> = {
  monday: 'Monday.com',
  gmail: 'Gmail',
  meeting: 'Meeting',
  mobile: 'Cluster',
  mind: 'Mind',
  slack: 'Slack',
  github: 'GitHub',
  gdocs: 'Google Docs',
  gong: 'Gong',
  x: 'X',
  discord: 'Discord',
  perplexity: 'Perplexity',
  salesforce: 'Salesforce',
  notch: 'Notch'
}

function formatSourceLabel(source: string | undefined): string {
  if (!source) return 'Knowledge'
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1)
}

function formatKindLabel(kind: string | undefined, source: string | undefined): string {
  if (!kind) return ''
  if (kind === 'integration_event') {
    if (source === 'monday') return 'Board update'
    if (source === 'gmail') return 'Inbox'
    if (source === 'slack') return 'Message'
    if (source === 'github') return 'Activity'
    if (source === 'gdocs') return 'Document'
    return 'Integration update'
  }
  const labels: Record<string, string> = {
    consciousness: 'Saved note',
    meeting_live: 'Live capture',
    action: 'Action taken',
    note: 'Note',
    mobile_cluster: 'Cluster assist'
  }
  return labels[kind] ?? kind.replace(/_/g, ' ')
}

function formatIntentionLabel(intention: string): string {
  const key = normalizeIntention(intention)
  if (key) return key.charAt(0).toUpperCase() + key.slice(1)
  return intention.charAt(0).toUpperCase() + intention.slice(1)
}

function intentionCardClass(intention: string): string {
  const key = normalizeIntention(intention)
  if (key) return `x-context-card-intent-${key}`
  return 'x-context-card-intent-default'
}

function intentionIntentClass(intention: string): string {
  const key = normalizeIntention(intention)
  if (key) return `x-context-intent x-context-intent-${key}`
  return 'x-context-intent'
}

function ContextSourceAvatar({ source }: { source: string | undefined }) {
  const key = source ?? 'insight'
  if (key === 'gmail') {
    return (
      <div className="x-context-avatar x-context-avatar-gmail" aria-hidden>
        <IconGmail className="x-context-avatar-icon" />
      </div>
    )
  }
  if (key === 'monday') {
    return (
      <div className="x-context-avatar x-context-avatar-monday" aria-hidden>
        <IconMonday className="x-context-avatar-icon" />
      </div>
    )
  }
  const av = SOURCE_AVATAR[key] ?? SOURCE_AVATAR.insight
  return (
    <div className="x-context-avatar" style={{ background: av.bg, color: av.color }} aria-hidden>
      {av.label}
    </div>
  )
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function useCalendarRail() {
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
    dayGroups,
    events: meetings,
    calendarConnected,
    calendarHint,
    pplxNews,
    pplxConnected,
    pplxHint
  }
}

function CalendarDayStrip({
  days,
  selectedDay,
  onSelect
}: {
  days: ReturnType<typeof buildDayStrip>
  selectedDay: number | null
  onSelect: (day: number | null) => void
}) {
  return (
    <div className="x-cal-strip" role="tablist" aria-label="Calendar days">
      {days.map((day) => (
        <button
          key={day.dayIndex}
          type="button"
          role="tab"
          aria-selected={selectedDay === day.dayIndex}
          className={`x-cal-strip-day ${day.dayIndex === 0 ? 'x-cal-strip-day-today' : ''} ${selectedDay === day.dayIndex ? 'x-cal-strip-day-active' : ''} ${day.count === 0 ? 'x-cal-strip-day-empty' : ''}`}
          onClick={() => onSelect(selectedDay === day.dayIndex ? null : day.dayIndex)}
        >
          <span className="x-cal-strip-weekday">{day.weekday}</span>
          <span className="x-cal-strip-date">{day.date}</span>
          {day.count > 0 ? <span className="x-cal-strip-count">{day.count}</span> : null}
        </button>
      ))}
    </div>
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

function CalendarNowMarker() {
  return (
    <div className="x-cal-now-row" aria-hidden>
      <div className="x-cal-agenda-gutter">
        <span className="x-cal-now-time">
          {new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      <div className="x-cal-agenda-track">
        <span className="x-cal-now-dot" />
        <span className="x-cal-now-line" />
      </div>
    </div>
  )
}

function CalendarAgendaRow({ event }: { event: CalendarRailEvent }) {
  const palette = eventPalette(event)
  const { start, end } = splitTimeLabel(event.timeLabel)
  const isMeet = event.kind === 'meet' && Boolean(event.link)
  const clickable = isMeet || Boolean(event.link)

  const open = () => {
    if (event.link) openMeeting(event.link)
  }

  return (
    <div
      className={`x-cal-agenda-row ${event.live ? 'x-cal-agenda-row-live' : ''} ${event.ended ? 'x-cal-agenda-row-ended' : ''}`}
    >
      <div className="x-cal-agenda-gutter">
        <span className="x-cal-agenda-start">{start}</span>
        {end ? <span className="x-cal-agenda-end">{end}</span> : null}
      </div>
      <div className="x-cal-agenda-track" aria-hidden>
        <span className="x-cal-agenda-node" style={{ background: palette.accent }} />
        <span className="x-cal-agenda-spine" />
      </div>
      <article
        className={`x-cal-agenda-block ${clickable ? 'x-cal-agenda-block-clickable' : ''}`}
        style={
          {
            '--cal-accent': palette.accent,
            '--cal-bg': palette.bg
          } as CSSProperties
        }
      >
        <button
          type="button"
          className="x-cal-agenda-block-body"
          disabled={!clickable}
          onClick={() => clickable && open()}
        >
          <p className="x-cal-agenda-title">
            {event.live ? <span className="x-cal-agenda-live-pill">Live</span> : null}
            {event.title}
          </p>
          <p className="x-cal-agenda-meta">
            {event.durationLabel}
            {isMeet ? (
              <>
                <span className="x-cal-agenda-meta-dot" aria-hidden>
                  ·
                </span>
                <IconVideoCall className="x-cal-agenda-meet-icon" />
                Meet
              </>
            ) : null}
          </p>
        </button>
        {isMeet ? (
          <button
            type="button"
            className="x-cal-agenda-join"
            aria-label={`Join ${event.title}`}
            title="Join Google Meet"
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
          >
            <IconVideoCall className="x-cal-agenda-join-icon" />
          </button>
        ) : null}
      </article>
    </div>
  )
}

function CalendarPanel({
  dayGroups,
  calendarConnected,
  calendarHint,
  allEvents
}: {
  dayGroups: ReturnType<typeof groupByDay>
  calendarConnected: boolean
  calendarHint: string | null
  allEvents: CalendarRailEvent[]
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const stripDays = useMemo(() => buildDayStrip(dayGroups), [dayGroups])
  const spotlight = useMemo(() => findSpotlightEvent(allEvents), [allEvents])
  const visibleGroups = useMemo(
    () => (selectedDay == null ? dayGroups : dayGroups.filter((g) => g.dayIndex === selectedDay)),
    [dayGroups, selectedDay]
  )
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="x-rail-tab-body x-cal-panel">
      <div className="x-cal-head">
        <div className="x-cal-head-row">
          <h2>{monthLabel}</h2>
          {calendarConnected ? <span className="x-cal-sync-badge">Synced</span> : null}
        </div>
        <p className="x-cal-sub">Google Calendar + Cal.com bookings</p>
      </div>

      {!calendarConnected ? (
        <p className="x-cal-empty">Connect Gmail or Cal.com in Apps to sync your schedule.</p>
      ) : dayGroups.length === 0 ? (
        <p className="x-cal-empty">{calendarHint ?? 'Nothing scheduled.'}</p>
      ) : (
        <>
          <CalendarDayStrip days={stripDays} selectedDay={selectedDay} onSelect={setSelectedDay} />
          {spotlight && selectedDay == null ? <CalendarSpotlight event={spotlight} /> : null}
          <div className="x-cal-days">
            {visibleGroups.map((group) => (
              <section key={group.dayIndex} className="x-cal-day">
                <header className="x-cal-day-header">
                  <h3
                    className={`x-cal-day-title ${group.dayIndex === 0 ? 'x-cal-day-title-today' : ''}`}
                  >
                    {formatDaySectionTitle(group.dayIndex, group.heading)}
                  </h3>
                  <span className="x-cal-day-meta">
                    {group.events.length} event{group.events.length === 1 ? '' : 's'}
                  </span>
                </header>
                {(() => {
                  const { earlierToday, upNext } =
                    group.dayIndex === 0
                      ? splitDayEvents(group.events)
                      : { earlierToday: [], upNext: group.events }

                  const renderAgenda = (list: CalendarRailEvent[], keyPrefix: string) =>
                    agendaWithNowMarker(list, group.dayIndex === 0).map((item, idx) =>
                      item.type === 'now' ? (
                        <CalendarNowMarker key={`${keyPrefix}-now-${idx}`} />
                      ) : (
                        <CalendarAgendaRow key={`${keyPrefix}-${item.event.id}`} event={item.event} />
                      )
                    )

                  return (
                    <div className="x-cal-day-sections">
                      {group.dayIndex === 0 && earlierToday.length > 0 ? (
                        <section className="x-cal-subsection x-cal-subsection-past">
                          <h4 className="x-cal-subsection-title">Earlier today</h4>
                          <div className="x-cal-agenda">{renderAgenda(earlierToday, 'past')}</div>
                        </section>
                      ) : null}
                      {upNext.length > 0 ? (
                        <section
                          className={`x-cal-subsection ${group.dayIndex === 0 ? 'x-cal-subsection-upcoming' : ''}`}
                        >
                          {group.dayIndex === 0 ? (
                            <h4 className="x-cal-subsection-title">
                              {earlierToday.length > 0 ? 'Up next' : 'Today'}
                            </h4>
                          ) : null}
                          <div className="x-cal-agenda">{renderAgenda(upNext, 'up')}</div>
                        </section>
                      ) : null}
                    </div>
                  )
                })()}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
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

function NewsPanel({
  pplxNews,
  pplxConnected,
  pplxHint
}: {
  pplxNews: PerplexityNewsItem[]
  pplxConnected: boolean
  pplxHint: string | null
}) {
  return (
    <div className="x-rail-tab-body">
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
  )
}

function ContextPanel() {
  const [recent, setRecent] = useState<RecentItem[]>([])
  const [filter, setFilter] = useState<IntentionFilter>('all')

  const loadRecent = async () => {
    try {
      const data = await clusterApi.kbStats()
      setRecent(data.recent)
    } catch {
      setRecent([])
    }
  }

  useEffect(() => {
    void loadRecent()
    const onMind = () => void loadRecent()
    window.addEventListener('notch:mind-updated', onMind)
    return () => window.removeEventListener('notch:mind-updated', onMind)
  }, [])

  const filtered = useMemo(() => {
    const sorted = [...recent].sort((a, b) => b.ingestedAt - a.ingestedAt)
    if (filter === 'all') return sorted
    return sorted.filter((item) => normalizeIntention(item.intention) === filter)
  }, [recent, filter])

  return (
    <div className="x-rail-tab-body">
      <div className="x-context-filters" role="tablist" aria-label="Filter by intention">
        {INTENTION_FILTERS.map((pill) => (
          <button
            key={pill.id}
            type="button"
            role="tab"
            aria-selected={filter === pill.id}
            className={`x-context-filter ${filter === pill.id ? 'x-context-filter-active' : ''}`}
            onClick={() => setFilter(pill.id)}
          >
            {pill.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="x-cal-empty">
          {recent.length === 0
            ? 'Nothing in the graph yet — use @mind in the feed to save notes.'
            : 'No items match this filter.'}
        </p>
      ) : (
        <ul className="x-context-list">
          {filtered.map((item) => {
            const kindLabel = formatKindLabel(item.kind, item.source)
            return (
              <li key={item.id} className={`x-context-card ${intentionCardClass(item.intention)}`}>
                <div className="x-context-card-head">
                  <div className="x-context-source">
                    <ContextSourceAvatar source={item.source} />
                    <div className="x-context-source-text">
                      <span className="x-context-source-name">{formatSourceLabel(item.source)}</span>
                      {kindLabel ? <span className="x-context-source-kind">{kindLabel}</span> : null}
                    </div>
                  </div>
                  <time className="x-context-time" dateTime={new Date(item.ingestedAt).toISOString()}>
                    {formatRelativeTime(item.ingestedAt)}
                  </time>
                </div>
                <p className="x-context-excerpt">
                  {cleanKbExcerpt(item.excerpt, 140)}
                </p>
                <div className="x-context-card-foot">
                  <span className={intentionIntentClass(item.intention)}>
                    <span className="x-context-intent-dot" aria-hidden />
                    {formatIntentionLabel(item.intention)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type FeedRailHandlers = {
  live?: boolean
  activeThreadId?: string | null
  contextItemId?: string | null
  onOpenThread?: (itemId: string, day?: string) => void
  onOpenInWork?: (itemId: string) => void
  onOpenWorkspace?: (event: CentralStreamEvent) => void
  onSelectContext?: (itemId: string) => void
  onRefresh?: () => void
}

type ComposeRailProps = {
  compose: string
  onComposeChange: (value: string) => void
  onSubmitCompose: () => void
  composeBusy?: boolean
  composeAction?: { provider: string; intent?: string } | null
  composeToast?: string | null
  composeError?: string | null
  mentionTargets?: ComposeMentionTarget[]
  contextLabel?: string | null
  mondayContext?: boolean
  onClearContext?: () => void
}

export function ContextRail({
  events = [],
  onOpenHome,
  railContext = {},
  feedRail,
  composeRail
}: {
  events?: CentralStreamEvent[]
  onOpenHome?: () => void
  railContext?: RailContext
  feedRail?: FeedRailHandlers
  composeRail?: ComposeRailProps
}) {
  const widgets = useRailWidgets()
  const visibleWidgets = useMemo(
    () => getVisibleWidgets(widgets, railContext),
    [widgets, railContext]
  )
  const visibleIds = useMemo(() => new Set(visibleWidgets.map((w) => w.id)), [visibleWidgets])
  const defaultTab = useMemo((): RailTab => {
    if (railContext.workspaceMode && visibleIds.has('feed')) return 'feed'
    return visibleWidgets[0]?.id ?? 'context'
  }, [railContext.workspaceMode, visibleIds, visibleWidgets])
  const [activeTab, setActiveTab] = useState<RailTab>(defaultTab)
  const [configOpen, setConfigOpen] = useState(false)
  const calendar = useCalendarRail()
  const agentPendingCount = useAgentPendingCount()

  useEffect(() => {
    if (visibleWidgets.length === 0) return
    if (!visibleIds.has(activeTab)) {
      setActiveTab(defaultTab)
    }
  }, [activeTab, defaultTab, visibleIds, visibleWidgets])

  return (
    <>
      {visibleWidgets.length === 0 ? (
        <>
          <div className="x-rail-tabs-bar x-rail-tabs-bar-empty">
            <span className="x-rail-tabs-bar-spacer" />
            <button
              type="button"
              className="x-rail-config-btn"
              aria-label="Configure sideblade widgets"
              title="Configure widgets"
              onClick={() => setConfigOpen(true)}
            >
              <IconSettings className="x-rail-config-icon" />
            </button>
          </div>
          <div className="x-rail-empty">
            <p>No sideblade widgets enabled.</p>
            <button type="button" className="x-rail-empty-btn" onClick={() => setConfigOpen(true)}>
              Choose widgets
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="x-rail-tabs-bar">
            <div className="x-rail-tabs" role="tablist" aria-label="Right rail">
              {visibleWidgets.map((widget) => (
                <button
                  key={widget.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === widget.id}
                  className={`x-rail-tab ${activeTab === widget.id ? 'x-rail-tab-active' : ''}`}
                  onClick={() => setActiveTab(widget.id)}
                >
                  {widgetLabel(widget.id)}
                  {widget.id === 'agent' && agentPendingCount > 0 ? (
                    <span className="x-rail-tab-badge" aria-label={`${agentPendingCount} pending`}>
                      {agentPendingCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="x-rail-config-btn"
              aria-label="Configure sideblade widgets"
              title="Configure widgets"
              onClick={() => setConfigOpen(true)}
            >
              <IconSettings className="x-rail-config-icon" />
            </button>
          </div>
          <div
            className={`x-rail-panel${activeTab === 'chat' ? ' x-rail-panel-chat' : ''}${activeTab === 'feed' ? ' x-rail-panel-feed' : ''}`}
            role="tabpanel"
          >
            {activeTab === 'feed' && composeRail ? (
              <FeedRailStreamPanel
                events={events}
                live={feedRail?.live}
                activeThreadId={feedRail?.activeThreadId}
                contextItemId={feedRail?.contextItemId}
                onOpenThread={feedRail?.onOpenThread}
                onOpenInWork={feedRail?.onOpenInWork}
                onOpenWorkspace={feedRail?.onOpenWorkspace}
                onSelectContext={feedRail?.onSelectContext}
                onRefresh={feedRail?.onRefresh}
                {...composeRail}
              />
            ) : null}
            {activeTab === 'context' && <ContextPanel />}
            {activeTab === 'calendar' && (
              <CalendarPanel
                dayGroups={calendar.dayGroups}
                allEvents={calendar.events}
                calendarConnected={calendar.calendarConnected}
                calendarHint={calendar.calendarHint}
              />
            )}
            {activeTab === 'chat' && <FeedRailChatPanel events={events} onOpenHome={onOpenHome} />}
            {activeTab === 'news' && (
              <NewsPanel
                pplxNews={calendar.pplxNews}
                pplxConnected={calendar.pplxConnected}
                pplxHint={calendar.pplxHint}
              />
            )}
            {activeTab === 'agent' ? <AgentInboxPanel /> : null}
          </div>
        </>
      )}
      <RailWidgetsConfigSheet open={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  )
}

/** @deprecated Use ContextRail */
export function RailWidgets() {
  return <ContextRail />
}
