import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClusterSearchHit } from '@shared/cluster'
import { FeedPost } from './FeedPost'
import { HomeChatProvider } from './homeChatContext'
import { WorkView } from './WorkView'
import { PostCallTaskDeck, PostCallProgress } from './PostCallTaskDeck'
import { meetingEventByItemId } from './meetingFocus'
import { ContextRail } from './ContextRail'
import { IntegrationsPanel } from './IntegrationsPanel'
import { BuildAgentsView } from './BuildAgentsView'
import { NotesView } from './NotesView'
import { NavBladeToggle, persistNavOpen, readNavOpen } from './NavBladeToggle'
import { SideNav, type NavTarget, type Page } from './SideNav'
import { NavAppPlayer } from './NavAppPlayer'
import { getNavApp, useNavApps } from './navAppsStore'
import { SettingsPanel } from './SettingsPanel'
import { ThemeMenu } from './ThemeMenu'
import { useTheme } from './useTheme'
import { ThreadBlade } from './ThreadBlade'
import { BrowserChrome } from './BrowserChrome'
import { WorkspaceBrowser } from './WorkspaceBrowser'
import { HomeWorkspaceRail } from './HomeWorkspaceRail'
import { PinnedAppShell } from './PinnedAppShell'
import { normalizeBrowserUrl, workspaceTabFromInput } from './browserUrl'
import { FeedSearchBar, filterFeedEvents } from './FeedSearchBar'
import { FeedStreamBar, useFeedStreamId } from './FeedStreamBar'
import { filterEventsByStream } from './feedStreamsStore'
import { useCentralStream } from './useCentralStream'
import {
  completeAgent,
  createAgentAbortSignal,
  startAgent,
  updateAgentStatus
} from './runningAgentsStore'
import { ComposeInput } from './ComposeInput'
import { useComposeContacts } from './useComposeContacts'
import { parseComposeCommand } from '@shared/compose'
import {
  getContextSelectedAt,
  setTaskCorrelation,
  trackComposeStart,
  trackOperatorEvent
} from '../lib/operatorTelemetry'
import { clusterApi, integrationApi, openBrowserLink, inferWorkspaceMeta } from '../lib/api'
import { isLinkedInBrowseHost, LINKEDIN_FEED_URL, shouldPersistWorkspaceUrl } from './embedBrowse'
import {
  migrateLegacyTabs,
  tabFromCalendarEvent,
  tabFromUrl,
  toWorkspaceTab,
  type HomePane,
  type PinnedAppSession,
  type WorkspaceTab
} from './workspace'

type WorkspaceView = 'home' | 'pinned'
import {
  IconEmoji,
  IconGif,
  IconMedia
} from './Icons'

type Tab = 'foryou' | 'signals'
type Area = 'work' | 'feed'

function streamItemId(event: { id: string; meta?: Record<string, unknown> }): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function sanitizePinnedSession(session: PinnedAppSession | null): PinnedAppSession | null {
  if (!session) return null
  const linkedIn = session.pinId === 'linkedin' || session.tab.source === 'linkedin'
  if (!linkedIn) return session
  if (shouldPersistWorkspaceUrl(session.tab.url, session.tab)) return session
  return {
    pinId: session.pinId,
    tab: tabFromUrl(LINKEDIN_FEED_URL, {
      title: 'LinkedIn',
      source: 'linkedin',
      id: `nav-${session.pinId}`,
      tabKind: 'pinned',
      pinId: session.pinId
    })
  }
}

function loadWorkspaceState(): {
  browserTabs: WorkspaceTab[]
  activeBrowserTabId: string | null
  homePane: HomePane
  pinnedSession: PinnedAppSession | null
  browserExpanded: boolean
  workspaceView: WorkspaceView
} {
  const defaults = {
    browserTabs: [] as WorkspaceTab[],
    activeBrowserTabId: null as string | null,
    homePane: 'chat' as HomePane,
    pinnedSession: null as PinnedAppSession | null,
    browserExpanded: true,
    workspaceView: 'home' as WorkspaceView
  }
  try {
    const rawBrowser = localStorage.getItem('stream.central.browserTabs')
    if (rawBrowser) {
      const browserTabs = JSON.parse(rawBrowser) as WorkspaceTab[]
      const activeBrowserTabId = localStorage.getItem('stream.central.activeBrowserTabId')
      const pinnedRaw = localStorage.getItem('stream.central.pinnedSession')
      const pinnedSession = sanitizePinnedSession(
        pinnedRaw ? (JSON.parse(pinnedRaw) as PinnedAppSession) : null
      )
      const browserExpanded = localStorage.getItem('stream.central.browserExpanded') !== '0'
      return {
        browserTabs,
        activeBrowserTabId: activeBrowserTabId ?? browserTabs.at(-1)?.id ?? null,
        homePane: 'chat',
        pinnedSession,
        browserExpanded,
        workspaceView: 'home'
      }
    }

    const legacyRaw = localStorage.getItem('stream.central.workspaceTabs')
    if (legacyRaw) {
      const legacyTabs = JSON.parse(legacyRaw) as WorkspaceTab[]
      const { browserTabs, pinnedSession: rawPinned } = migrateLegacyTabs(legacyTabs)
      const pinnedSession = sanitizePinnedSession(rawPinned)
      const legacyActive = localStorage.getItem('stream.central.activeWorkspaceId')
      let activeBrowserTabId = browserTabs.at(-1)?.id ?? null
      if (legacyActive && browserTabs.some((t) => t.id === legacyActive)) {
        activeBrowserTabId = legacyActive
      }
      return {
        browserTabs,
        activeBrowserTabId,
        homePane: 'chat',
        pinnedSession,
        browserExpanded: true,
        workspaceView: 'home'
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return defaults
}

export function CentralApp() {
  const persistedWorkspace = loadWorkspaceState()

  const { events, live, syncing } = useCentralStream()
  const [area, setArea] = useState<Area>('work')
  const [tab, setTab] = useState<Tab>('foryou')
  const [page, setPage] = useState<Page>('stream')
  const [focusMeetingItemId, setFocusMeetingItemId] = useState<string | null>(null)
  const [compose, setCompose] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [composeToast, setComposeToast] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const { mentionTargets: contactMentions } = useComposeContacts()
  const [contextItemId, setContextItemId] = useState<string | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const [threadTarget, setThreadTarget] = useState<{ itemId: string; day?: string } | null>(null)
  const [feedQuery, setFeedQuery] = useState('')
  const [feedStreamId, setFeedStreamId] = useFeedStreamId()
  const [feedRailCollapsed, setFeedRailCollapsed] = useState(() => {
    try {
      return localStorage.getItem('notch.feedRailCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [workspaceRailCollapsed, setWorkspaceRailCollapsed] = useState(() => {
    try {
      return localStorage.getItem('notch.workspaceRailCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [navOpen, setNavOpen] = useState(readNavOpen)
  const navLocationRef = useRef({ page, area })
  const [browserSidebarCollapsed, setBrowserSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('notch.browserSidebarCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [tabReloadKeys, setTabReloadKeys] = useState<Record<string, number>>({})
  const [browserTabs, setBrowserTabs] = useState<WorkspaceTab[]>(persistedWorkspace.browserTabs)
  const [activeBrowserTabId, setActiveBrowserTabId] = useState<string | null>(
    persistedWorkspace.activeBrowserTabId
  )
  const [homePane, setHomePane] = useState<HomePane>(persistedWorkspace.homePane)
  const [pinnedSession, setPinnedSession] = useState<PinnedAppSession | null>(
    persistedWorkspace.pinnedSession
  )
  const [browserExpanded, setBrowserExpanded] = useState(persistedWorkspace.browserExpanded)
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(persistedWorkspace.workspaceView)
  const { theme, setTheme } = useTheme()
  const { apps: navApps, remove: removeNavApp, pinCatalog: pinNavApp } = useNavApps()
  const [activeNavAppId, setActiveNavAppId] = useState<string | null>(null)
  const [navAppMini, setNavAppMini] = useState(false)
  const autoShadedRef = useRef(new Set<string>())

  const activeNavApp = activeNavAppId ? getNavApp(activeNavAppId, navApps) : null

  const closeNavApp = useCallback(() => {
    setActiveNavAppId(null)
    setNavAppMini(false)
    void window.notchDesktop?.destroyNavApp?.()
    setPage((p) => (p === 'navapp' ? 'stream' : p))
  }, [])

  /** Only dock mini when a video is actively playing — never on a bare app visit. */
  const dockNavAppMini = useCallback(async (): Promise<boolean> => {
    const app = activeNavAppId ? getNavApp(activeNavAppId, navApps) : null
    if (!app?.miniPlayer) {
      closeNavApp()
      return false
    }

    try {
      const state = await window.notchDesktop?.getNavAppPlayback?.()
      if (!state?.playing) {
        closeNavApp()
        return false
      }
      setNavAppMini(true)
      return true
    } catch {
      closeNavApp()
      return false
    }
  }, [activeNavAppId, navApps, closeNavApp])

  const withNavAppLeave = useCallback(
    (action: () => void) => {
      if (page === 'navapp' && activeNavAppId) {
        void dockNavAppMini().finally(action)
        return
      }
      action()
    },
    [page, activeNavAppId, dockNavAppMini]
  )

  const minimizeNavAppToFeed = useCallback(() => {
    void dockNavAppMini().then((docked) => {
      if (!docked) return
      setPage('stream')
      setArea('feed')
    })
  }, [dockNavAppMini])

  useEffect(() => {
    if (!navAppMini || !activeNavAppId) return
    const verify = async () => {
      const state = await window.notchDesktop?.getNavAppPlayback?.()
      if (!state?.playing) closeNavApp()
    }
    const interval = window.setInterval(() => void verify(), 4000)
    return () => window.clearInterval(interval)
  }, [navAppMini, activeNavAppId, closeNavApp])

  useEffect(() => {
    void window.notchDesktop?.setNavAppTheme?.(theme)?.catch?.(() => undefined)
  }, [theme])

  const openNavApp = (appId: string) => {
    const app = getNavApp(appId, navApps)
    if (!app) return
    if (app.surface === 'workspace') {
      setPage('stream')
      setArea('work')
      setActiveNavAppId(null)
      setNavAppMini(false)
      void window.notchDesktop?.destroyNavApp?.()
      setFocusMeetingItemId(null)
      if (pinnedSession?.pinId === app.id) {
        setWorkspaceView('pinned')
        if (
          app.id === 'linkedin' &&
          !isLinkedInBrowseHost(pinnedSession.tab.url) &&
          !pinnedSession.tab.url.includes('linkedin.com')
        ) {
          const meta = inferWorkspaceMeta(app.url)
          setPinnedSession({
            pinId: app.id,
            tab: tabFromUrl(app.url, {
              title: app.label,
              source: meta.source,
              id: `nav-${app.id}`,
              tabKind: 'pinned',
              pinId: app.id
            })
          })
        }
        return
      }
      const meta = inferWorkspaceMeta(app.url)
      const tab = tabFromUrl(app.url, {
        title: app.label,
        source: meta.source,
        id: `nav-${app.id}`,
        tabKind: 'pinned',
        pinId: app.id
      })
      setPinnedSession({ pinId: app.id, tab })
      setWorkspaceView('pinned')
      return
    }
    setPage('navapp')
    setActiveNavAppId(appId)
    setNavAppMini(false)
    setFocusMeetingItemId(null)
  }

  const resetToHomeChat = useCallback(() => {
    closeNavApp()
    setThreadTarget(null)
    setFeedQuery('')
    setContextItemId(null)
    setFocusMeetingItemId(null)
    setWorkspaceView('home')
    setHomePane('chat')
    setPage('stream')
    setArea('work')
    setTab('foryou')
  }, [closeNavApp])

  // After hard refresh (⌘⇧R), tear down orphan BrowserViews from the main process.
  useEffect(() => {
    return window.notchDesktop?.onNavAppRendererReady?.(() => {
      void window.notchDesktop?.destroyNavApp?.()
    })
  }, [])

  const filtered =
    tab === 'signals'
      ? events.filter((e) => ['signal', 'insight', 'build_prompt'].includes(e.kind))
      : events.filter(
          (e) =>
            e.kind !== 'transcript_live' &&
            e.kind !== 'signal' &&
            e.kind !== 'assist' &&
            !(e.kind === 'insight' && e.source === 'gong') &&
            !(e.source === 'meet' && e.joinable && e.meta?.live === 'true')
        )

  const streamFiltered = useMemo(
    () => filterEventsByStream(filtered, feedStreamId),
    [filtered, feedStreamId]
  )

  const feedFiltered = useMemo(
    () => filterFeedEvents(streamFiltered, feedQuery),
    [streamFiltered, feedQuery]
  )

  const openThreadFromSearch = (hit: import('@shared/cluster').ClusterSearchHit) => {
    const itemId = hit.itemId ?? hit.id.replace(/^ext-/, '')
    const threadable = hit.source === 'monday' || hit.source === 'gmail'
    if (threadable && itemId) {
      setThreadTarget({ itemId, day: hit.day })
      setContextItemId(itemId)
    }
    setFeedQuery(hit.title.slice(0, 80))
  }

  const feedTabs: { id: Tab; label: string }[] = [
    { id: 'foryou', label: 'For you' },
    { id: 'signals', label: 'Signals' }
  ]

  const refreshStream = () => window.dispatchEvent(new Event('notch:stream-push'))

  const openSearchHit = (hit: ClusterSearchHit) => {
    withNavAppLeave(() => {
      setPage('stream')
      setArea('feed')
      const itemId = hit.itemId ?? hit.id.replace(/^ext-/, '')
      if (hit.source === 'monday' || hit.source === 'gmail') {
        setThreadTarget({ itemId, day: hit.day })
        setContextItemId(itemId)
      }
    })
  }

  const openMeetingInWork = (itemId: string) => {
    withNavAppLeave(() => {
      setPage('stream')
      setFocusMeetingItemId(itemId)
    })
  }

  const onNav = (item: NavTarget) => {
    if (item.navAppId) {
      if (item.navAppId === activeNavAppId && page === 'navapp') return
      // Switching embedded apps should not mini-dock the outgoing session.
      if (page === 'navapp' && activeNavAppId && item.navAppId !== activeNavAppId) {
        openNavApp(item.navAppId)
        return
      }
      withNavAppLeave(() => openNavApp(item.navAppId))
      return
    }
    withNavAppLeave(() => {
      if (item.page) {
        setPage(item.page)
        return
      }
      setPage('stream')
      if (item.area) setArea(item.area)
      if (item.tab) setTab(item.tab)
      setWorkspaceView('home')
    })
  }

  const openAgentsFeed = () => {
    withNavAppLeave(() => {
      setPage('build')
      setWorkspaceView('home')
      setFocusMeetingItemId(null)
    })
  }

  const goHome = () => {
    withNavAppLeave(() => {
      setPage('stream')
      setArea('work')
      setTab('foryou')
      setThreadTarget(null)
      setFeedQuery('')
      setContextItemId(null)
      setFocusMeetingItemId(null)
      setWorkspaceView('home')
      setHomePane('chat')
    })
  }

  const openBrowserTab = useCallback((tab: WorkspaceTab, opts?: { activate?: boolean }) => {
    const tempTab = { ...tab, tabKind: 'temp' as const }
    setWorkspaceView('home')
    setPage('stream')
    setArea('work')
    setActiveNavAppId(null)
    setNavAppMini(false)
    void window.notchDesktop?.destroyNavApp?.()
    setBrowserTabs((prev) => {
      const existing = prev.find((t) => t.id === tempTab.id)
      if (existing) {
        if (opts?.activate !== false) {
          setActiveBrowserTabId(existing.id)
          setHomePane('browser')
        }
        return prev
      }
      if (opts?.activate !== false) {
        setActiveBrowserTabId(tempTab.id)
        setHomePane('browser')
      }
      return [...prev, tempTab]
    })
  }, [])

  const openWorkspace = (event: (typeof events)[number]) => {
    const tab = toWorkspaceTab(event)
    if (!tab) return
    openBrowserTab(tab)
  }

  const closeBrowserTab = (id: string) => {
    setBrowserTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeBrowserTabId === id) {
        const fallback = next.at(-1)?.id ?? null
        setActiveBrowserTabId(fallback)
        if (!fallback) setHomePane('chat')
      }
      return next
    })
  }

  const navigateBrowserTab = useCallback((id: string, input: string) => {
    const url = normalizeBrowserUrl(input)
    const meta = inferWorkspaceMeta(url)
    setBrowserTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, url, title: meta.title, source: meta.source } : t))
    )
  }, [])

  const syncBrowserTabUrl = useCallback((id: string, url: string) => {
    setBrowserTabs((prev) => {
      const tab = prev.find((t) => t.id === id)
      if (tab && !shouldPersistWorkspaceUrl(url, tab)) return prev
      const meta = inferWorkspaceMeta(url)
      return prev.map((t) => (t.id === id ? { ...t, url, title: meta.title, source: meta.source } : t))
    })
  }, [])

  const syncPinnedTabUrl = useCallback((url: string) => {
    setPinnedSession((prev) => {
      if (!prev || !shouldPersistWorkspaceUrl(url, prev.tab)) return prev
      const meta = inferWorkspaceMeta(url)
      const pinnedLinkedIn = prev.pinId === 'linkedin' || prev.tab.source === 'linkedin'
      return {
        ...prev,
        tab: {
          ...prev.tab,
          url,
          title: pinnedLinkedIn ? 'LinkedIn' : meta.title,
          source: pinnedLinkedIn ? 'linkedin' : meta.source
        }
      }
    })
  }, [])

  const navigatePinnedTab = useCallback((input: string) => {
    const url = normalizeBrowserUrl(input)
    const meta = inferWorkspaceMeta(url)
    setPinnedSession((prev) => {
      if (!prev) return null
      const pinnedLinkedIn = prev.pinId === 'linkedin' || prev.tab.source === 'linkedin'
      return {
        ...prev,
        tab: {
          ...prev.tab,
          url,
          title: pinnedLinkedIn && isLinkedInBrowseHost(url) ? 'LinkedIn' : meta.title,
          source: pinnedLinkedIn ? 'linkedin' : meta.source
        }
      }
    })
  }, [])

  const newBrowserTab = useCallback((input: string) => {
    const tab = workspaceTabFromInput(input, { unique: true })
    setWorkspaceView('home')
    setPage('stream')
    setArea('work')
    setHomePane('browser')
    setActiveBrowserTabId(tab.id)
    setBrowserTabs((prev) => [...prev, tab])
  }, [])

  const reloadBrowserTab = useCallback((id: string) => {
    setTabReloadKeys((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))
  }, [])

  const selectHomeChat = useCallback(() => {
    setWorkspaceView('home')
    setHomePane('chat')
  }, [])

  const selectHomeBrowser = useCallback(() => {
    setWorkspaceView('home')
    setHomePane('browser')
    setActiveBrowserTabId((current) => current ?? browserTabs.at(-1)?.id ?? null)
  }, [browserTabs])

  const selectBrowserTab = useCallback((id: string) => {
    setWorkspaceView('home')
    setHomePane('browser')
    setActiveBrowserTabId(id)
  }, [])

  const toggleNavOpen = useCallback(() => {
    setNavOpen((open) => {
      const next = !open
      persistNavOpen(next)
      trackOperatorEvent('panel_toggle', { panel: 'nav', open: next }, { surface: 'home' })
      return next
    })
  }, [])

  const toggleBrowserSidebar = useCallback(() => {
    setBrowserSidebarCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('notch.browserSidebarCollapsed', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const activeBrowserTab = browserTabs.find((t) => t.id === activeBrowserTabId) ?? null
  const pinnedActive = workspaceView === 'pinned' && pinnedSession != null
  const showWorkspaceRail = page === 'stream' && area === 'work' && workspaceView === 'home'
  const homeBrowserActive =
    workspaceView === 'home' && homePane === 'browser' && browserTabs.length > 0
  const browserMode = pinnedActive || homeBrowserActive
  const composeAction = parseComposeCommand(compose)
  const contextEvent = contextItemId
    ? events.find((e) => streamItemId(e) === contextItemId)
    : null
  const mondayContext = contextEvent?.source === 'monday'

  const selectContext = (itemId: string) => {
    setContextItemId(itemId)
    const source = events.find((e) => streamItemId(e) === itemId)?.source
    setTaskCorrelation(itemId)
    trackOperatorEvent(
      'feed_context_select',
      { itemId, source },
      { surface: area === 'feed' ? 'feed' : 'stream_rail', subjectType: 'stream_item', subjectId: itemId }
    )
    void clusterApi.markSeen(itemId).catch(() => {})
  }

  const submitCompose = async () => {
    if (!composeAction || composeBusy) return
    const startedAt = Date.now()
    const timeToActionMs = getContextSelectedAt() ? startedAt - (getContextSelectedAt() ?? startedAt) : undefined
    setComposeBusy(true)
    setComposeError(null)
    setComposeToast(null)
    const preview = compose.trim().replace(/^@\S+\s*/, '').trim() || composeAction.provider
    const agentId = startAgent({
      title: preview.length > 56 ? `${preview.slice(0, 55)}…` : preview,
      status: 'Running action…'
    })
    const signal = createAgentAbortSignal(agentId)
    try {
      updateAgentStatus(agentId, 'Executing…')
      const result = await clusterApi.runAction(
        {
          text: compose,
          contextItemId: contextItemId ?? undefined
        },
        { signal }
      )
      trackOperatorEvent(
        'compose_submit',
        {
          provider: composeAction.provider,
          intent: composeAction.intent,
          contextItemId: contextItemId ?? undefined,
          ok: result.ok,
          timeToActionMs
        },
        {
          surface: 'home',
          subjectType: contextItemId ? 'stream_item' : 'compose_action',
          subjectId: contextItemId ?? compose.slice(0, 64)
        }
      )
      setCompose('')
      if (result.ok) {
        setComposeToast(result.message)
        if (composeAction.provider === 'mind') {
          window.dispatchEvent(new Event('notch:mind-updated'))
        }
        if (composeAction.provider === 'monday') {
          void integrationApi.syncSource('monday').catch(() => undefined)
        }
        if (composeAction.intent === 'send') {
          setContextItemId(null)
          setTaskCorrelation()
        }
      } else {
        setComposeError(result.message)
      }
      window.dispatchEvent(new Event('stream:user-role'))
    } catch (err) {
      if (!signal.aborted) {
        setComposeError(err instanceof Error ? err.message : 'Action failed')
      }
    } finally {
      completeAgent(agentId)
      setComposeBusy(false)
    }
  }

  useEffect(() => {
    if (!composeToast) return
    const t = window.setTimeout(() => setComposeToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [composeToast])

  useEffect(() => {
    return window.notch?.onSimRefresh?.(() => {
      setPage('stream')
      setArea('work')
    })
  }, [])

  useEffect(() => {
    const onStarted = window.notch?.meeting?.onStarted?.((sessionId: string) => {
      trackOperatorEvent(
        'meeting_start',
        { sessionId },
        { subjectType: 'meeting', subjectId: sessionId, surface: 'workspace' }
      )
      setPage('stream')
      setArea('work')
      setFocusMeetingItemId(null)
    })
    const onEnded = window.notch?.meeting?.onEnded?.((result: unknown) => {
      const payload = result as {
        sessionId?: string
        durationMs?: number
        feedItemId?: string
        chunkCount?: number
      } | null
      if (payload?.sessionId) {
        trackOperatorEvent(
          'meeting_end',
          {
            sessionId: payload.sessionId,
            durationMs: payload.durationMs ?? 0,
            chunkCount: payload.chunkCount ?? 0,
            feedItemId: payload.feedItemId
          },
          { subjectType: 'meeting', subjectId: payload.sessionId, surface: 'workspace' }
        )
      }
      setPage('stream')
      setArea('work')
      if (payload?.feedItemId) {
        setFocusMeetingItemId(String(payload.feedItemId).replace(/^ext-/, ''))
      }
      refreshStream()
      window.dispatchEvent(new Event('notch:engagements-updated'))
    })
    return () => {
      onStarted?.()
      onEnded?.()
    }
  }, [])

  useEffect(() => {
    const prev = navLocationRef.current
    const nextKey = `${page}:${area}`
    const prevKey = `${prev.page}:${prev.area}`
    if (nextKey !== prevKey) {
      trackOperatorEvent(
        'nav_change',
        { from: prevKey, to: nextKey, page, area, surface: area === 'feed' ? 'feed' : 'home' },
        { surface: page === 'stream' ? (area === 'feed' ? 'feed' : 'home') : page }
      )
      navLocationRef.current = { page, area }
    }
  }, [page, area])

  useEffect(() => {
    localStorage.setItem('stream.central.browserTabs', JSON.stringify(browserTabs))
  }, [browserTabs])

  useEffect(() => {
    if (activeBrowserTabId) localStorage.setItem('stream.central.activeBrowserTabId', activeBrowserTabId)
    else localStorage.removeItem('stream.central.activeBrowserTabId')
  }, [activeBrowserTabId])

  useEffect(() => {
    localStorage.setItem('stream.central.homePane', homePane)
  }, [homePane])

  useEffect(() => {
    if (pinnedSession) localStorage.setItem('stream.central.pinnedSession', JSON.stringify(pinnedSession))
    else localStorage.removeItem('stream.central.pinnedSession')
  }, [pinnedSession])

  useEffect(() => {
    localStorage.setItem('stream.central.browserExpanded', browserExpanded ? '1' : '0')
  }, [browserExpanded])

  useEffect(() => {
    localStorage.setItem('stream.central.workspaceView', workspaceView)
  }, [workspaceView])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{
        url: string
        title?: string
        source?: WorkspaceTab['source']
        summary?: string
        id?: string
        activate?: boolean
        tabKind?: 'pinned' | 'temp'
        pinId?: string
      }>).detail
      if (!detail?.url) return
      if (detail.tabKind === 'pinned' && detail.pinId) {
        const tab = tabFromUrl(detail.url, {
          title: detail.title ?? 'Tab',
          source: detail.source,
          summary: detail.summary,
          id: detail.id,
          tabKind: 'pinned',
          pinId: detail.pinId
        })
        setPage('stream')
        setArea('work')
        setActiveNavAppId(null)
        setNavAppMini(false)
        void window.notchDesktop?.destroyNavApp?.()
        setPinnedSession({ pinId: detail.pinId, tab })
        setWorkspaceView('pinned')
        return
      }
      const tab = tabFromUrl(detail.url, {
        title: detail.title ?? 'Tab',
        source: detail.source,
        summary: detail.summary,
        id: detail.id,
        tabKind: 'temp'
      })
      openBrowserTab(tab, { activate: detail.activate !== false })
    }
    window.addEventListener('notch:open-workspace', onOpen)
    return () => window.removeEventListener('notch:open-workspace', onOpen)
  }, [openBrowserTab])

  useEffect(() => {
    return window.notchDesktop?.onOpenUrl?.((url) => {
      const meta = inferWorkspaceMeta(url)
      openBrowserLink(url, { title: meta.title, source: meta.source })
    })
  }, [])

  useEffect(() => {
    if (page !== 'stream') return

    const shadeUpcoming = async () => {
      try {
        const data = await clusterApi.calendar()
        const now = Date.now()
        let focusTab: WorkspaceTab | null = null

        for (const evt of data.events ?? []) {
          const tab = tabFromCalendarEvent(evt)
          if (!tab) continue

          const startsIn = evt.startsAt - now
          const isLive = evt.live || (startsIn <= 0 && !evt.ended)
          const startsSoon = startsIn > 0 && startsIn <= 15 * 60_000
          const morningPrep =
            evt.dayIndex === 0 && startsIn > 15 * 60_000 && startsIn <= 4 * 3_600_000

          if (!isLive && !startsSoon && !morningPrep) continue
          if (autoShadedRef.current.has(tab.id)) {
            if (isLive || startsSoon) focusTab = tab
            continue
          }

          autoShadedRef.current.add(tab.id)
          openBrowserTab({ ...tab, autoOpened: true }, { activate: false })
          if (isLive || startsSoon) focusTab = tab
        }

        if (focusTab) {
          setActiveBrowserTabId(focusTab.id)
          setHomePane('browser')
          setWorkspaceView('home')
        }
      } catch {
        /* calendar optional */
      }
    }

    void shadeUpcoming()
    const interval = window.setInterval(() => void shadeUpcoming(), 60_000)
    const onCalendarsUpdated = () => void shadeUpcoming()
    window.addEventListener('notch:calendars-updated', onCalendarsUpdated)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('notch:calendars-updated', onCalendarsUpdated)
    }
  }, [page, openBrowserTab])

  const toggleFeedRail = useCallback(() => {
    setFeedRailCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('notch.feedRailCollapsed', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      trackOperatorEvent('panel_toggle', { panel: 'feed_rail', open: !next }, { surface: 'stream_rail' })
      return next
    })
  }, [])

  const toggleWorkspaceRail = useCallback(() => {
    setWorkspaceRailCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('notch.workspaceRailCollapsed', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      trackOperatorEvent('panel_toggle', { panel: 'workspace_rail', open: !next }, { surface: 'workspace' })
      return next
    })
  }, [])

  const focusMeetingEvent = useMemo(
    () => meetingEventByItemId(events, focusMeetingItemId),
    [events, focusMeetingItemId]
  )

  useEffect(() => {
    if (!focusMeetingItemId || focusMeetingEvent) return
    const onPush = () => refreshStream()
    window.addEventListener('notch:stream-push', onPush)
    return () => window.removeEventListener('notch:stream-push', onPush)
  }, [focusMeetingItemId, focusMeetingEvent])

  const showPostCallRail = Boolean(focusMeetingItemId) && page === 'stream'
  const contextRailCollapsed = pinnedActive || homeBrowserActive
    ? workspaceRailCollapsed
    : area === 'feed'
      ? feedRailCollapsed
      : false
  const showContextRail =
    !threadTarget &&
    !showPostCallRail &&
    page !== 'navapp' &&
    !contextRailCollapsed

  const showThreadRail =
    Boolean(threadTarget) && page === 'stream' && (area === 'feed' || browserMode)
  const hasRightRail = showThreadRail || showPostCallRail || showContextRail

  const slideBladeLayout = showWorkspaceRail && !pinnedActive

  const navAppPlayerMode =
    !activeNavApp ? 'off' : page === 'navapp' && !navAppMini ? 'full' : navAppMini ? 'mini' : 'off'

  return (
    <div
      className={`x-app ${navOpen ? 'x-app-nav-open' : 'x-app-nav-closed'} ${showThreadRail ? 'x-app-thread-open' : ''} ${showPostCallRail ? 'x-app-post-call-open' : ''} ${browserMode ? 'x-app-browser-mode' : ''} ${showWorkspaceRail ? 'x-app-workspace-open' : ''} ${page === 'navapp' ? 'x-app-nav-app' : page !== 'stream' ? 'x-app-utility' : 'x-app-stream'} ${!hasRightRail ? 'x-app-no-rail' : ''}${slideBladeLayout ? ' x-app-home-chat' : ''}${navAppMini ? ' x-app-nav-app-mini' : ''}${pinnedActive ? ' x-app-pinned-app' : ''}`}
    >
      {typeof window !== 'undefined' &&
      (window.notchDesktop != null || /Electron/i.test(navigator.userAgent)) ? (
        <div className="x-macos-titlebar" aria-hidden="true" />
      ) : null}
      <div className="x-shell">
        <NavBladeToggle open={navOpen} onToggle={toggleNavOpen} />
        {navOpen ? (
          <SideNav
            page={page}
            area={area}
            tab={tab}
            live={live}
            navApps={navApps}
            activeNavAppId={activeNavAppId}
            onNavigate={onNav}
            onOpenNavApp={openNavApp}
            onPinApp={(id) => pinNavApp(id)}
            onRemoveNavApp={(id) => {
              if (activeNavAppId === id) closeNavApp()
              removeNavApp(id)
            }}
            onBrowseApps={() => setPage('integrations')}
            onGoHome={goHome}
            themeOpen={themeOpen}
            onThemeToggle={() => setThemeOpen((v) => !v)}
            themeBtnRef={themeBtnRef}
          />
        ) : null}

        <ThemeMenu
          open={themeOpen}
          theme={theme}
          setTheme={setTheme}
          anchorRef={themeBtnRef}
          onClose={() => setThemeOpen(false)}
        />

      {page === 'settings' ? (
        <main className="x-main x-main-utility">
          <SettingsPanel />
        </main>
      ) : page === 'integrations' ? (
        <main className="x-main x-main-utility">
          <IntegrationsPanel
            navApps={navApps}
            onOpenNavApp={openNavApp}
            onPinNavApp={(id) => pinNavApp(id)}
            onUnpinNavApp={(id) => {
              if (activeNavAppId === id) closeNavApp()
              removeNavApp(id)
            }}
          />
        </main>
      ) : page === 'build' ? (
        <main className="x-main x-main-utility">
          <BuildAgentsView
            events={events}
            onOpenIntegrations={() => setPage('integrations')}
            onFocusMeeting={openMeetingInWork}
          />
        </main>
      ) : page === 'notes' ? (
        <main className="x-main x-main-utility">
          <NotesView onOpenIntegrations={() => setPage('integrations')} />
        </main>
      ) : page === 'navapp' ? (
        <main className="x-main x-main-nav-app" aria-hidden="true" />
      ) : (
        <HomeChatProvider>
          <>
          <div className={`x-channel ${showThreadRail || showPostCallRail ? 'x-channel-has-thread' : ''}`}>
          <div className="x-channel-main">
          {pinnedSession && !pinnedActive ? (
            <div className="x-pinned-app-container x-workspace-browser-parked" aria-hidden="true">
              <WorkspaceBrowser
                tabs={[pinnedSession.tab]}
                activeId=""
                reloadKeys={tabReloadKeys}
                onTabUrlChange={(_, url) => syncPinnedTabUrl(url)}
              />
            </div>
          ) : null}
          {showWorkspaceRail ? (
            <div className="x-browser-shell">
              <HomeWorkspaceRail
                homePane={homePane}
                browserTabs={browserTabs}
                activeBrowserTabId={activeBrowserTabId}
                browserExpanded={browserExpanded}
                collapsed={browserSidebarCollapsed}
                onSelectChat={selectHomeChat}
                onSelectBrowser={selectHomeBrowser}
                onToggleBrowserExpanded={() => setBrowserExpanded((v) => !v)}
                onSelectBrowserTab={selectBrowserTab}
                onCloseBrowserTab={closeBrowserTab}
                onNewBrowserTab={newBrowserTab}
                onToggleCollapsed={toggleBrowserSidebar}
              />
              {browserSidebarCollapsed ? (
                <button
                  type="button"
                  className="x-workspace-rail-tab"
                  aria-label="Show Home panel"
                  title="Show Home panel"
                  onClick={toggleBrowserSidebar}
                >
                  ›
                </button>
              ) : null}
              <div className="x-browser-main">
                {homeBrowserActive && activeBrowserTab ? (
                  <BrowserChrome
                    tab={activeBrowserTab}
                    onNavigate={(url) => navigateBrowserTab(activeBrowserTab.id, url)}
                    onReload={() => reloadBrowserTab(activeBrowserTab.id)}
                    onExternal={() =>
                      openBrowserLink(activeBrowserTab.url, {
                        forceExternal: true,
                        title: activeBrowserTab.title,
                        source: activeBrowserTab.source
                      })
                    }
                    railCollapsed={workspaceRailCollapsed}
                    onToggleRail={toggleWorkspaceRail}
                    workspaceMode
                  />
                ) : null}
                <main
                  className={`x-main x-browser-content ${threadTarget ? 'x-col-feed-in-thread' : ''} x-main-work x-main-home ${homeBrowserActive ? 'x-main-workspace' : 'x-col-feed'}`}
                >
                  {browserTabs.length > 0 ? (
                    <WorkspaceBrowser
                      tabs={browserTabs}
                      activeId={homeBrowserActive ? (activeBrowserTabId ?? '') : ''}
                      reloadKeys={tabReloadKeys}
                      onTabUrlChange={syncBrowserTabUrl}
                    />
                  ) : null}
                  {homePane === 'chat' ? (
                    <WorkView
                      events={events}
                      live={live}
                      syncing={syncing}
                      onFocusMeeting={setFocusMeetingItemId}
                      onRefresh={refreshStream}
                      onOpenSearchHit={openSearchHit}
                    />
                  ) : null}
                </main>
              </div>
            </div>
          ) : pinnedActive && pinnedSession ? (
            <div className="x-browser-shell x-pinned-app-container">
              <div className="x-browser-main">
                <PinnedAppShell
                  session={pinnedSession}
                  onBackHome={goHome}
                  onNavigate={navigatePinnedTab}
                  onReload={() => reloadBrowserTab(pinnedSession.tab.id)}
                  onExternal={() =>
                    openBrowserLink(pinnedSession.tab.url, {
                      forceExternal: true,
                      title: pinnedSession.tab.title,
                      source: pinnedSession.tab.source
                    })
                  }
                  onNewTab={() => newBrowserTab('https://www.google.com')}
                  railCollapsed={workspaceRailCollapsed}
                  onToggleRail={toggleWorkspaceRail}
                />
                <main className="x-main x-main-work x-main-home x-main-workspace x-browser-content">
                  <WorkspaceBrowser
                    tabs={[pinnedSession.tab]}
                    activeId={pinnedSession.tab.id}
                    reloadKeys={tabReloadKeys}
                    onTabUrlChange={(_, url) => syncPinnedTabUrl(url)}
                  />
                </main>
              </div>
            </div>
          ) : (
          <main
            className={`x-main x-col-feed ${threadTarget ? 'x-col-feed-in-thread' : ''} ${area === 'work' ? 'x-main-work x-main-home' : ''}`}
          >
            {area === 'work' ? (
              <WorkView
                events={events}
                live={live}
                syncing={syncing}
                onFocusMeeting={setFocusMeetingItemId}
                onRefresh={refreshStream}
                onOpenSearchHit={openSearchHit}
              />
            ) : (
              <>
            <header className="x-topbar">
              <div className="x-topbar-tabs" role="tablist" aria-label="Feed filters">
                {feedTabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`x-tab ${tab === t.id ? 'active' : ''}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <FeedSearchBar
                query={feedQuery}
                onQueryChange={setFeedQuery}
                matchCount={feedFiltered.length}
                totalCount={streamFiltered.length}
                onSelectHit={openThreadFromSearch}
              />
              <button
                type="button"
                className={`x-topbar-rail-toggle${feedRailCollapsed ? ' x-topbar-rail-toggle-collapsed' : ''}`}
                aria-label={feedRailCollapsed ? 'Show context panel' : 'Hide context panel'}
                title={feedRailCollapsed ? 'Show context panel' : 'Hide context panel'}
                onClick={toggleFeedRail}
              >
                {feedRailCollapsed ? '◧ Panel' : '◨ Panel'}
              </button>
            </header>

            <FeedStreamBar activeStreamId={feedStreamId} onStreamChange={setFeedStreamId} />

                  <div className="x-compose">
                    <div className="x-avatar x-avatar-user">A</div>
                    <div className="x-compose-body">
                      {contextEvent && (
                        <div className="x-compose-context">
                          <span>
                            {mondayContext ? 'Updating Monday item:' : 'Replying to:'}{' '}
                            {contextEvent.title || contextEvent.body.slice(0, 72)}
                          </span>
                          <button
                            type="button"
                            className="x-compose-context-clear"
                            onClick={() => setContextItemId(null)}
                            aria-label="Clear reply context"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      {composeToast && <p className="x-compose-toast">{composeToast}</p>}
                      {composeError && (
                        <p className="x-compose-note x-compose-note-error">{composeError}</p>
                      )}
                      <ComposeInput
                        value={compose}
                        onChange={(v) => {
                          if (!compose && v) trackComposeStart(contextItemId ?? undefined)
                          setCompose(v)
                          if (composeError) setComposeError(null)
                        }}
                        onSubmit={() => void submitCompose()}
                        mentionTargets={contactMentions}
                        placeholder={
                          mondayContext
                            ? '@monday: comment or move to Done · @monday create: new ticket'
                            : '@mind · @claude · @gemini · @cursor · @github · @gdocs · @gong · @perplexity · @gmail · @monday · @slack · @discord · @x'
                        }
                        rows={3}
                      />
                      <div className="x-compose-toolbar">
                        <div className="x-compose-icons">
                          <button type="button" aria-label="Media"><IconMedia className="x-compose-icon" /></button>
                          <button type="button" aria-label="GIF"><IconGif className="x-compose-icon" /></button>
                          <button type="button" aria-label="Emoji"><IconEmoji className="x-compose-icon" /></button>
                        </div>
                        <button
                          type="button"
                          className="x-compose-post"
                          disabled={!composeAction || composeBusy}
                          onClick={() => void submitCompose()}
                        >
                          {composeBusy ? 'Running…' : composeAction ? 'Run action' : 'Post'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {feedFiltered.length === 0 && feedQuery.trim() ? (
                    <p className="x-feed-search-no-results">No posts match “{feedQuery.trim()}”</p>
                  ) : null}

                  {feedFiltered.map((e, i) => (
                    <FeedPost
                      key={e.id}
                      event={e}
                      surface="feed"
                      isNew={live && i === 0}
                      isContext={contextItemId === streamItemId(e)}
                      activeThreadId={threadTarget?.itemId ?? null}
                      onOpenWorkspace={openWorkspace}
                      onOpenInWork={openMeetingInWork}
                      onOpenThread={(itemId, day) => {
                        selectContext(itemId)
                        setThreadTarget({ itemId, day })
                      }}
                      onSelectContext={selectContext}
                    />
                  ))}
              </>
            )}
          </main>
          )}
          {activeNavApp && navAppPlayerMode === 'mini' ? (
            <NavAppPlayer
              app={activeNavApp}
              mode="mini"
              hasRail={false}
              onMinimize={minimizeNavAppToFeed}
              onExpand={() => {
                setNavAppMini(false)
                setPage('navapp')
              }}
              onClose={closeNavApp}
            />
          ) : null}
          </div>
          </div>

          {showThreadRail && threadTarget ? (
            <aside className="x-rail x-col-rail x-rail-thread">
              <ThreadBlade
                itemId={threadTarget.itemId}
                day={threadTarget.day}
                contextItemId={contextItemId ?? threadTarget.itemId}
                onClose={() => setThreadTarget(null)}
              />
            </aside>
          ) : showPostCallRail ? (
            <aside className="x-rail x-col-rail x-rail-thread x-rail-post-call">
              {focusMeetingEvent ? (
                <PostCallTaskDeck
                  event={focusMeetingEvent}
                  variant="rail"
                  onDismiss={() => setFocusMeetingItemId(null)}
                  onRefresh={refreshStream}
                />
              ) : (
                <div className="x-post-call-rail-loading">
                  <header className="x-post-call-nav x-post-call-nav-rail">
                    <button
                      type="button"
                      className="x-post-call-rail-back"
                      onClick={() => setFocusMeetingItemId(null)}
                    >
                      ← Back
                    </button>
                    <div className="x-post-call-nav-main">
                      <h1 className="x-post-call-nav-title">Processing call</h1>
                      <p className="x-post-call-nav-sub">Extracting scope and next steps</p>
                    </div>
                  </header>
                  <PostCallProgress syncing={syncing} />
                </div>
              )}
            </aside>
          ) : showContextRail ? (
            <aside className="x-rail x-col-rail">
              <ContextRail
                events={streamFiltered}
                onOpenHome={goHome}
                railContext={{ page, area, tab, workspaceMode: browserMode }}
                feedRail={{
                  live,
                  activeThreadId: threadTarget?.itemId ?? null,
                  contextItemId,
                  onOpenThread: (itemId, day) => {
                    selectContext(itemId)
                    setThreadTarget({ itemId, day })
                  },
                  onOpenInWork: openMeetingInWork,
                  onOpenWorkspace: openWorkspace,
                  onSelectContext: selectContext
                }}
                composeRail={{
                  compose,
                  onComposeChange: (v) => {
                    if (!compose && v) trackComposeStart(contextItemId ?? undefined)
                    setCompose(v)
                    if (composeError) setComposeError(null)
                  },
                  onSubmitCompose: () => void submitCompose(),
                  composeBusy,
                  composeAction,
                  composeToast,
                  composeError,
                  mentionTargets: contactMentions,
                  contextLabel: contextEvent
                    ? contextEvent.title || contextEvent.body.slice(0, 72)
                    : null,
                  mondayContext,
                  onClearContext: () => {
                    setContextItemId(null)
                    setTaskCorrelation()
                  }
                }}
              />
            </aside>
          ) : null}
        </>
        </HomeChatProvider>
      )}

      </div>

      {activeNavApp && navAppPlayerMode === 'full' ? (
        <NavAppPlayer
          app={activeNavApp}
          mode="full"
          hasRail={hasRightRail}
          onMinimize={minimizeNavAppToFeed}
          onExpand={() => {
            setNavAppMini(false)
            setPage('navapp')
          }}
          onClose={closeNavApp}
        />
      ) : activeNavApp && navAppPlayerMode === 'mini' && page !== 'stream' ? (
        <NavAppPlayer
          app={activeNavApp}
          mode="mini"
          hasRail={hasRightRail}
          onMinimize={minimizeNavAppToFeed}
          onExpand={() => {
            setNavAppMini(false)
            setPage('navapp')
          }}
          onClose={closeNavApp}
        />
      ) : null}
    </div>
  )
}
