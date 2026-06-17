import { useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent, PerplexityNewsItem } from '@shared/cluster'
import { cleanKbExcerpt } from '@shared/assistText'
import { clusterApi, openExternal } from '../lib/api'
import { CalendarPanel, useCalendarRail } from './CalendarView'
import { FeedRailChatPanel } from './FeedRailChatPanel'
import { AgentInboxPanel } from './AgentInboxPanel'
import { useAgentPendingCount } from './useAgentPendingCount'
import { FeedRailStreamPanel } from './FeedRailStreamPanel'
import type { ComposeMentionTarget } from '@shared/compose'
import { IconGmail, IconMonday, IconSettings } from './Icons'
import type { WorkspaceBrowserPageContext } from './workspaceBrowserContext'
import { RailWidgetsConfigSheet } from './RailWidgetsConfig'
import {
  getVisibleWidgets,
  useRailWidgets,
  widgetLabel,
  type RailContext,
  type RailWidgetId
} from './railWidgetsStore'
import { resolveRailDefaultTab, setRailLastTab, useRailDock } from './railDockStore'

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
  onOpenBuildDojo,
  railContext = {},
  feedRail,
  composeRail,
  browserTabId = null,
  browserPageContext = null,
  onRefreshBrowserPageContext
}: {
  events?: CentralStreamEvent[]
  onOpenHome?: () => void
  onOpenBuildDojo?: () => void
  railContext?: RailContext
  feedRail?: FeedRailHandlers
  composeRail?: ComposeRailProps
  browserTabId?: string | null
  browserPageContext?: WorkspaceBrowserPageContext | null
  onRefreshBrowserPageContext?: () => void | Promise<void>
}) {
  const widgets = useRailWidgets()
  const dock = useRailDock()
  const visibleWidgets = useMemo(
    () => getVisibleWidgets(widgets, railContext),
    [widgets, railContext]
  )
  const visibleIds = useMemo(() => new Set(visibleWidgets.map((w) => w.id)), [visibleWidgets])
  const defaultTab = useMemo((): RailTab => {
    const fallback =
      railContext.workspaceMode && visibleIds.has('feed')
        ? 'feed'
        : (visibleWidgets[0]?.id ?? 'context')
    return resolveRailDefaultTab({
      workspaceMode: Boolean(railContext.workspaceMode),
      visibleIds,
      fallback
    })
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

  const selectTab = (tab: RailTab) => {
    setActiveTab(tab)
    setRailLastTab(tab)
  }

  useEffect(() => {
    if (activeTab !== 'chat' || !browserTabId || !onRefreshBrowserPageContext) return
    void onRefreshBrowserPageContext()
  }, [activeTab, browserTabId, onRefreshBrowserPageContext])

  useEffect(() => {
    const onOpenInbox = () => {
      if (visibleIds.has('agent')) selectTab('agent')
    }
    window.addEventListener('notch:open-agent-inbox', onOpenInbox)
    return () => window.removeEventListener('notch:open-agent-inbox', onOpenInbox)
  }, [visibleIds])

  return (
    <>
      {visibleWidgets.length === 0 ? (
        <>
          <div className="x-rail-tabs-bar x-rail-tabs-bar-empty">
            <span className="x-rail-tabs-bar-spacer" />
            <button
              type="button"
              className="x-rail-config-btn"
              aria-label="Configure dock station"
              title="Dock station settings"
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
          <div className={`x-rail-tabs-bar${dock.compactTabs ? ' x-rail-tabs-bar-compact' : ''}`}>
            <div className="x-rail-tabs" role="tablist" aria-label="Dock station">
              {visibleWidgets.map((widget) => (
                <button
                  key={widget.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === widget.id}
                  className={`x-rail-tab ${activeTab === widget.id ? 'x-rail-tab-active' : ''}`}
                  onClick={() => selectTab(widget.id)}
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
              aria-label="Configure dock station"
              title="Dock station settings"
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
                allEvents={calendar.events}
                calendarConnected={calendar.calendarConnected}
                calendarHint={calendar.calendarHint}
              />
            )}
            {activeTab === 'chat' && (
              <FeedRailChatPanel
                events={events}
                onOpenHome={onOpenHome}
                browserPageContext={browserPageContext}
              />
            )}
            {activeTab === 'news' && (
              <NewsPanel
                pplxNews={calendar.pplxNews}
                pplxConnected={calendar.pplxConnected}
                pplxHint={calendar.pplxHint}
              />
            )}
            {activeTab === 'agent' ? (
              <AgentInboxPanel events={events} onOpenBuildDojo={onOpenBuildDojo} />
            ) : null}
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
