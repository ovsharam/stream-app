import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistResult, CalendarRailEvent, CentralStreamEvent, ClusterSearchHit, PerplexityNewsItem } from '@shared/cluster'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'
import { isConversationalQuery } from '../lib/displayText'
import { normalizeAssistResult } from '@shared/assistText'
import { clusterApi, openExternal, openMeeting } from '../lib/api'
import { IconSearch, IconVideoCall } from './Icons'
import { EngagementsPanel } from './EngagementsPanel'
import { PortalSearchResults } from './PortalSearchResults'
import {
  buildPortalBrief,
  formatRelativeTime,
  newsHeadlines,
  overnightFromKb,
  readCachedPortal,
  sourceLabel,
  writeCachedPortal,
  type PortalSnapshot
} from './portalBrief'
import { cleanKbExcerpt } from '@shared/assistText'

const SEARCH_SUGGESTIONS = [
  'Monday tasks',
  'What needs my attention today?',
  'Prep me for my next call'
]

type Props = {
  events: CentralStreamEvent[]
  onFocusMeeting: (itemId: string) => void
  onOpenSearchHit?: (hit: ClusterSearchHit) => void
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function pendingActionCount(event: CentralStreamEvent): number {
  const meta = parseMeetingActionsMeta(event.meta)
  if (!meta) return 0
  return meta.proposedActions.filter((p) => !meta.approvedActions?.[p.id]?.ok).length
}

function meetingEvents(events: CentralStreamEvent[]): CentralStreamEvent[] {
  return events.filter((e) => e.source === 'meeting')
}

export function DailyPortal({ events, onFocusMeeting, onOpenSearchHit }: Props) {
  const [calendar, setCalendar] = useState<CalendarRailEvent[]>([])
  const [news, setNews] = useState<PerplexityNewsItem[]>([])
  const [portal, setPortal] = useState<PortalSnapshot | null>(() => readCachedPortal())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<ClusterSearchHit[]>([])
  const [assist, setAssist] = useState<AssistResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [assistLoading, setAssistLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchGenRef = useRef(0)

  const meetings = useMemo(() => meetingEvents(events), [events])
  const pendingMeetings = useMemo(
    () =>
      meetings
        .map((m) => ({
          id: streamItemId(m),
          title: m.title.replace(/^Meeting ·\s*/i, ''),
          count: pendingActionCount(m)
        }))
        .filter((m) => m.count > 0),
    [meetings]
  )

  const meetingsRef = useRef(meetings)
  const pendingMeetingsRef = useRef(pendingMeetings)
  meetingsRef.current = meetings
  pendingMeetingsRef.current = pendingMeetings

  const loadPortal = useCallback(async (bumpRefresh = false) => {
    const mtgs = meetingsRef.current
    const pending = pendingMeetingsRef.current
    try {
      const [cal, kb] = await Promise.all([clusterApi.calendar(), clusterApi.kbStats()])
      setCalendar(cal.events ?? [])
      setNews(cal.perplexity?.news ?? [])

      const overnight = overnightFromKb(kb.recent)
      setPortal((prev) => {
        const snapshot: PortalSnapshot = {
          brief: buildPortalBrief({
            calendar: cal.events ?? [],
            meetings: mtgs,
            overnight,
            refreshedAt: bumpRefresh ? Date.now() : (prev?.brief.refreshedAt ?? Date.now())
          }),
          overnight,
          pendingMeetings: pending
        }
        writeCachedPortal(snapshot)
        return snapshot
      })
    } catch {
      setPortal((prev) =>
        prev ?? {
          brief: buildPortalBrief({ calendar: [], meetings: mtgs, overnight: [] }),
          overnight: [],
          pendingMeetings: pending
        }
      )
    }
  }, [])

  useEffect(() => {
    void loadPortal(true)
    const interval = window.setInterval(() => void loadPortal(true), 5 * 60_000)
    return () => window.clearInterval(interval)
  }, [loadPortal])

  useEffect(() => {
    setPortal((prev) => (prev ? { ...prev, pendingMeetings } : prev))
  }, [pendingMeetings])

  const runSearch = async (q?: string) => {
    const trimmed = (q ?? searchQuery).trim()
    if (!trimmed) return

    const gen = ++searchGenRef.current
    setSearchQuery(trimmed)
    setHasSearched(true)
    setAssist(null)
    setSearching(true)

    try {
      const hits = await clusterApi.search(trimmed)
      if (gen !== searchGenRef.current) return
      setSearchHits(hits)
    } catch {
      if (gen === searchGenRef.current) setSearchHits([])
    } finally {
      if (gen === searchGenRef.current) setSearching(false)
    }

    if (!isConversationalQuery(trimmed)) return

    setAssistLoading(true)
    try {
      const result = await clusterApi.assist(trimmed)
      if (gen === searchGenRef.current) {
        setAssist({ ...result, ...normalizeAssistResult(result, trimmed) })
      }
    } catch {
      if (gen === searchGenRef.current) setAssist(null)
    } finally {
      if (gen === searchGenRef.current) setAssistLoading(false)
    }
  }

  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed || trimmed.length < 2) {
      setSearchHits([])
      setHasSearched(false)
      return
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const capturedGen = searchGenRef.current

    searchDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const hits = await clusterApi.search(trimmed)
          if (capturedGen !== searchGenRef.current) return
          setSearchHits(hits)
        } catch {
          if (capturedGen === searchGenRef.current) setSearchHits([])
        }
      })()
    }, 220)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchQuery])

  const clearSearch = () => {
    searchGenRef.current += 1
    setSearchQuery('')
    setSearchHits([])
    setAssist(null)
    setHasSearched(false)
    setSearching(false)
    setAssistLoading(false)
  }

  const brief = portal?.brief
  const todayEvents = calendar.filter((e) => e.dayIndex === 0 && !e.ended)
  const nextEvent =
    calendar.find((e) => !e.ended && e.startsAt >= Date.now() - 15 * 60_000) ?? todayEvents[0]

  return (
    <div className="x-portal">
      <header className="x-portal-hero">
        <div className="x-portal-hero-top">
          <div>
            <p className="x-portal-date">{brief?.dateLabel}</p>
            <h1 className="x-portal-greeting">{brief?.greeting ?? 'Hello'}</h1>
          </div>
          {brief ? (
            <p className="x-portal-refreshed">
              Updated {formatRelativeTime(brief.refreshedAt)}
            </p>
          ) : null}
        </div>

        <div className="x-portal-search-wrap">
          <IconSearch className="x-portal-search-icon" />
          <input
            className="x-portal-search"
            value={searchQuery}
            placeholder="Search stream — Monday, Gmail, meetings… or ask a question"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void runSearch()
              }
              if (e.key === 'Escape') clearSearch()
            }}
          />
          <button
            type="button"
            className="x-portal-search-btn"
            disabled={!searchQuery.trim() || searching || assistLoading}
            onClick={() => void runSearch()}
          >
            {searching ? '…' : assistLoading ? '…' : isConversationalQuery(searchQuery) ? 'Ask' : 'Search'}
          </button>
        </div>

        {!hasSearched && !searchQuery.trim() ? (
          <div className="x-portal-suggestions">
            {SEARCH_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="x-portal-suggestion"
                onClick={() => {
                  setSearchQuery(s)
                  void runSearch(s)
                }}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {hasSearched || searchHits.length > 0 || assistLoading || assist ? (
          <PortalSearchResults
            query={searchQuery}
            hits={searchHits}
            assist={assist}
            searching={searching}
            assistLoading={assistLoading}
            onDismiss={clearSearch}
            onOpenHit={(hit) => onOpenSearchHit?.(hit)}
          />
        ) : null}
      </header>

      {brief ? (
        <section className="x-portal-lead">
          <p className="x-portal-lead-kicker">Today&apos;s lead</p>
          <h2 className="x-portal-lead-headline">{brief.headline}</h2>
          <p className="x-portal-lead-body">{brief.lead}</p>
        </section>
      ) : null}

      <div className="x-portal-grid">
        <section className="x-portal-widget x-portal-widget-wide">
          <header className="x-portal-widget-head">
            <h3>Today&apos;s schedule</h3>
            {todayEvents.length > 0 ? <span>{todayEvents.length} events</span> : null}
          </header>
          {todayEvents.length === 0 ? (
            <p className="x-portal-empty">Nothing on calendar — connect Gmail in Apps.</p>
          ) : (
            <ul className="x-portal-schedule">
              {todayEvents.slice(0, 5).map((evt) => (
                <li key={evt.id} className={`x-portal-schedule-row ${evt.live ? 'x-portal-schedule-live' : ''}`}>
                  <div className="x-portal-schedule-time">{evt.live ? 'Now' : evt.timeLabel.split('–')[0]?.trim()}</div>
                  <div className="x-portal-schedule-main">
                    <p className="x-portal-schedule-title">{evt.title}</p>
                    <p className="x-portal-schedule-meta">{evt.durationLabel}</p>
                  </div>
                  {evt.link ? (
                    <button
                      type="button"
                      className="x-portal-schedule-join"
                      onClick={() => openMeeting(evt.link!, evt.title)}
                    >
                      <IconVideoCall className="x-work-join-icon" />
                      Join
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="x-portal-widget">
          <header className="x-portal-widget-head">
            <h3>Clients</h3>
            <span>FDE engagements</span>
          </header>
          <EngagementsPanel compact onOpenMeeting={onFocusMeeting} />
        </section>

        <section className="x-portal-widget">
          <header className="x-portal-widget-head">
            <h3>Needs you</h3>
            {(portal?.pendingMeetings.length ?? 0) > 0 ? (
              <span className="x-portal-widget-badge">{portal!.pendingMeetings.length}</span>
            ) : null}
          </header>
          {(portal?.pendingMeetings.length ?? 0) === 0 ? (
            <p className="x-portal-empty">All caught up — no tasks to route.</p>
          ) : (
            <ul className="x-portal-action-list">
              {portal!.pendingMeetings.map((m) => (
                <li key={m.id}>
                  <button type="button" className="x-portal-action-row" onClick={() => onFocusMeeting(m.id)}>
                    <span className="x-portal-action-title">{m.title}</span>
                    <span className="x-portal-action-badge">{m.count} to approve</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="x-portal-widget">
          <header className="x-portal-widget-head">
            <h3>Overnight</h3>
            <span>Agent work</span>
          </header>
          {(portal?.overnight.length ?? 0) === 0 ? (
            <p className="x-portal-empty">Quiet night — agents will populate this as integrations sync.</p>
          ) : (
            <ul className="x-portal-overnight">
              {portal!.overnight.slice(0, 5).map((item) => (
                <li key={item.id} className="x-portal-overnight-row">
                  <span className="x-portal-overnight-source">{sourceLabel(item.source)}</span>
                  <p className="x-portal-overnight-excerpt">{cleanKbExcerpt(item.excerpt, 120)}</p>
                  <time className="x-portal-overnight-time">{formatRelativeTime(item.ingestedAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </section>

        {news.length > 0 ? (
          <section className="x-portal-widget">
            <header className="x-portal-widget-head">
              <h3>Headlines</h3>
              <span>Perplexity</span>
            </header>
            <ul className="x-portal-news">
              {newsHeadlines(news).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="x-portal-news-row"
                    onClick={() => item.url && openExternal(item.url)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {nextEvent && !nextEvent.ended ? (
          <section className="x-portal-widget x-portal-widget-accent">
            <header className="x-portal-widget-head">
              <h3>Next up</h3>
              {nextEvent.live ? <span className="x-portal-live-dot">Live</span> : null}
            </header>
            <p className="x-portal-next-title">{nextEvent.title}</p>
            <p className="x-portal-next-meta">{nextEvent.timeLabel} · {nextEvent.durationLabel}</p>
            {nextEvent.link ? (
              <button
                type="button"
                className="x-action-btn x-action-btn-primary x-portal-next-join"
                onClick={() => openMeeting(nextEvent.link!, nextEvent.title)}
              >
                <IconVideoCall className="x-work-join-icon" />
                Join in Notch
              </button>
            ) : null}
            <p className="x-portal-hint">⌘⇧L to start capture when the call begins</p>
          </section>
        ) : null}
      </div>
    </div>
  )
}
