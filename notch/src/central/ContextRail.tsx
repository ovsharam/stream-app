import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CalendarRailEvent, ClusterSearchHit, CentralStreamEvent, PerplexityNewsItem } from '@shared/cluster'
import { cleanKbExcerpt } from '@shared/assistText'
import { clusterApi, openExternal, openMeeting } from '../lib/api'
import { FeedRailChatPanel } from './FeedRailChatPanel'
import { IconGmail, IconMonday, IconSearch, IconVideoCall } from './Icons'

type RailTab = 'context' | 'calendar' | 'chat' | 'news'
type IntentionFilter = 'all' | 'plan' | 'explore' | 'execute'

type RecentItem = {
  id: string
  excerpt: string
  intention: string
  kind?: string
  source?: string
  ingestedAt: number
}

const RAIL_TABS: { id: RailTab; label: string }[] = [
  { id: 'context', label: 'Context' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'chat', label: 'Chat' },
  { id: 'news', label: 'News' }
]

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

  return {
    dayGroups,
    calendarConnected,
    calendarHint,
    pplxNews,
    pplxConnected,
    pplxHint
  }
}

function RailSearch() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ClusterSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    try {
      setHits(await clusterApi.search(trimmed))
    } catch {
      setHits([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      setSearching(false)
      return
    }
    const t = setTimeout(() => void runSearch(query), 280)
    return () => clearTimeout(t)
  }, [query, runSearch])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const showResults = open && query.trim().length > 0

  return (
    <div className="x-search x-rail-search" ref={wrapRef}>
      <IconSearch className="x-search-icon" />
      <input
        value={query}
        placeholder="Search knowledge & stream"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void runSearch(query)
            setOpen(true)
          }
          if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {showResults && (
        <div className="x-search-results" role="listbox">
          {searching && hits.length === 0 && (
            <p className="x-search-results-empty">Searching…</p>
          )}
          {!searching && hits.length === 0 && (
            <p className="x-search-results-empty">No matches</p>
          )}
          {hits.slice(0, 8).map((hit) => (
            <button
              key={hit.id}
              type="button"
              className="x-search-hit"
              role="option"
              onClick={() => {
                setQuery(hit.title)
                setOpen(false)
              }}
            >
              <span className="x-search-hit-title">{hit.title}</span>
              <span className="x-search-hit-snippet">{hit.snippet}</span>
              <span className="x-search-hit-source">{hit.source}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
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

function CalendarPanel({
  dayGroups,
  calendarConnected,
  calendarHint
}: {
  dayGroups: ReturnType<typeof groupByDay>
  calendarConnected: boolean
  calendarHint: string | null
}) {
  return (
    <div className="x-rail-tab-body">
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
      <div className="x-cal-head">
        <h2>Context</h2>
        <p className="x-cal-sub">Recent knowledge by intention</p>
      </div>
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

export function ContextRail({
  events = [],
  onOpenHome
}: {
  events?: CentralStreamEvent[]
  onOpenHome?: () => void
}) {
  const [activeTab, setActiveTab] = useState<RailTab>('context')
  const calendar = useCalendarRail()

  return (
    <>
      <RailSearch />
      <div className="x-rail-tabs" role="tablist" aria-label="Right rail">
        {RAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`x-rail-tab ${activeTab === tab.id ? 'x-rail-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className={`x-rail-panel${activeTab === 'chat' ? ' x-rail-panel-chat' : ''}`}
        role="tabpanel"
      >
        {activeTab === 'context' && <ContextPanel />}
        {activeTab === 'calendar' && (
          <CalendarPanel
            dayGroups={calendar.dayGroups}
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
      </div>
    </>
  )
}

/** @deprecated Use ContextRail */
export function RailWidgets() {
  return <ContextRail />
}
