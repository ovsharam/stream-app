import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClusterSearchHit } from '@shared/cluster'
import { isSyntheticLinkedInThreadId } from '@shared/linkedin-thread'
import { FeedPost } from './FeedPost'
import { HomeChatProvider } from './homeChatContext'
import { WorkView } from './WorkView'
import { PostCallTaskDeck, PostCallProgress } from './PostCallTaskDeck'
import { meetingEventByItemId } from './meetingFocus'
import { ContextRail } from './ContextRail'
import { IntegrationsPanel } from './IntegrationsPanel'
import { BuildDojo } from './BuildDojo'
import { NotesView } from './NotesView'
import { MindGraphView } from './MindGraphView'
import { PipelineView } from './PipelineView'
import { NavBladeToggle, persistNavOpen, readNavOpen } from './NavBladeToggle'
import { SideNav, type NavTarget, type Page } from './SideNav'
import { NavAppPlayer } from './NavAppPlayer'
import { WorkspaceMiniPlayer } from './WorkspaceMiniPlayer'
import { getNavApp, isNavAppPinned, useNavApps } from './navAppsStore'
import { SettingsPanel } from './SettingsPanel'
import { ThemeMenu } from './ThemeMenu'
import { useTheme } from './useTheme'
import { ThreadBlade } from './ThreadBlade'
import { BrowserChrome } from './BrowserChrome'
import { WorkspaceBrowser } from './WorkspaceBrowser'
import { HomeWorkspaceRail } from './HomeWorkspaceRail'
import { PinnedAppShell } from './PinnedAppShell'
import { LinkedInBackgroundPerception } from './LinkedInBackgroundPerception'
import { AppToastStack } from './AppToastStack'
import { useAgentProposalNotifications } from './useAgentProposalNotifications'
import { useCalendarToasts } from './useCalendarToasts'
import { markCalendarShaded, wasCalendarShaded } from './calendarShade'
import { useRailDockCss } from './useRailDockCss'
import { RailResizeHandle } from './RailResizeHandle'
import { LinkedInPerceptionProvider } from './LinkedInPerceptionContext'
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
import { composeActionFromText, meetActionTextForSubmit } from '@shared/meeting-compose'
import {
  getContextSelectedAt,
  setTaskCorrelation,
  trackComposeStart,
  trackOperatorEvent
} from '../lib/operatorTelemetry'
import { clusterApi, integrationApi, openBrowserLink, inferWorkspaceMeta } from '../lib/api'
import {
  isGoogleBlockedAuthUrl,
  isLinkedInBrowseHost,
  LINKEDIN_FEED_URL,
  shouldPersistWorkspaceUrl
} from './embedBrowse'
import {
  migrateLegacyTabs,
  tabFromCalendarEvent,
  tabFromUrl,
  toWorkspaceTab,
  type HomePane,
  type PinnedAppSession,
  type WorkspaceTab
} from './workspace'
import {
  applyYoutubeMiniLayout,
  findWorkspaceWebview,
  getWorkspaceWebviewPlayback,
  pauseWorkspaceMedia,
  tabEligibleForMiniPlayer
} from './workspacePlayback'
import { forceWebviewRepaint, repaintAllWorkspaceWebviews } from './useWebviewResizeSync'
import { useWebviewNavigation } from './useWebviewNavigation'
import {
  captureWorkspaceBrowserContext,
  type WorkspaceBrowserPageContext
} from './workspaceBrowserContext'

type WorkspaceMini = {
  tabId: string
  label: string
  url: string
  pinId?: string
}

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

const PINNED_APP_HOME_URL: Record<string, string> = {
  gmail: 'https://mail.google.com/',
  youtube: 'https://www.youtube.com/',
  gdocs: 'https://docs.google.com/',
  calendar: 'https://calendar.google.com/',
  google: 'https://www.google.com/'
}

function sanitizeBrowserTab(tab: WorkspaceTab): WorkspaceTab {
  if (!isGoogleBlockedAuthUrl(tab.url)) return tab
  const key = tab.pinId ?? tab.source
  const url = (key && PINNED_APP_HOME_URL[key]) || 'https://mail.google.com/'
  return { ...tab, url, summary: url }
}

function sanitizeBrowserTabs(tabs: WorkspaceTab[]): WorkspaceTab[] {
  return tabs.map(sanitizeBrowserTab)
}

function sanitizePinnedSession(session: PinnedAppSession | null): PinnedAppSession | null {
  if (!session) return null
  let tab = sanitizeBrowserTab(session.tab)
  let next = tab === session.tab ? session : { ...session, tab }
  const linkedIn = next.pinId === 'linkedin' || next.tab.source === 'linkedin'
  if (linkedIn && !shouldPersistWorkspaceUrl(next.tab.url, next.tab)) {
    next = {
      pinId: next.pinId,
      tab: tabFromUrl(LINKEDIN_FEED_URL, {
        title: 'LinkedIn',
        source: 'linkedin',
        id: `nav-${next.pinId}`,
        tabKind: 'pinned',
        pinId: next.pinId
      })
    }
  }
  return next
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
      const browserTabs = sanitizeBrowserTabs(JSON.parse(rawBrowser) as WorkspaceTab[])
      const activeBrowserTabId = localStorage.getItem('stream.central.activeBrowserTabId')
      const pinnedRaw = localStorage.getItem('stream.central.pinnedSession')
      const pinnedSession = sanitizePinnedSession(
        pinnedRaw ? (JSON.parse(pinnedRaw) as PinnedAppSession) : null
      )
      const browserExpanded = localStorage.getItem('stream.central.browserExpanded') !== '0'
      let resolvedActiveId = activeBrowserTabId ?? browserTabs.at(-1)?.id ?? null
      const activeTab = resolvedActiveId
        ? browserTabs.find((t) => t.id === resolvedActiveId)
        : null
      // Don't restore focus to auto-opened calendar meet tabs after refresh.
      if (activeTab?.autoOpened && activeTab.id.startsWith('cal-')) {
        resolvedActiveId = browserTabs.find((t) => t.id !== activeTab.id)?.id ?? null
      }
      return {
        browserTabs,
        activeBrowserTabId: resolvedActiveId,
        homePane: 'chat',
        pinnedSession,
        browserExpanded,
        workspaceView: 'home'
      }
    }

    const legacyRaw = localStorage.getItem('stream.central.workspaceTabs')
    if (legacyRaw) {
      const legacyTabs = JSON.parse(legacyRaw) as WorkspaceTab[]
      const { browserTabs: rawBrowserTabs, pinnedSession: rawPinned } = migrateLegacyTabs(legacyTabs)
      const browserTabs = sanitizeBrowserTabs(rawBrowserTabs)
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

  const { events, live, syncing, streamError } = useCentralStream()
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
      const stored = localStorage.getItem('notch.feedRailCollapsed')
      // Default open on feed — only collapse when user explicitly hid the panel.
      return stored === '1'
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
  const [workspaceMini, setWorkspaceMini] = useState<WorkspaceMini | null>(null)
  const [browserPageContext, setBrowserPageContext] = useState<WorkspaceBrowserPageContext | null>(
    null
  )
  const autoShadedRef = useRef(new Set<string>())

  const activeNavApp = activeNavAppId ? getNavApp(activeNavAppId, navApps) : null
  const linkedInPinned =
    isNavAppPinned('linkedin', navApps) || pinnedSession?.pinId === 'linkedin'

  useAgentProposalNotifications()
  useCalendarToasts()
  useRailDockCss()

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

  const resolveWorkspaceMediaTab = useCallback((): WorkspaceTab | null => {
    if (workspaceView === 'pinned' && pinnedSession) {
      const app = getNavApp(pinnedSession.pinId, navApps)
      if (!app?.miniPlayer || !tabEligibleForMiniPlayer(pinnedSession.tab)) return null
      return pinnedSession.tab
    }
    if (workspaceView === 'home' && homePane === 'browser' && activeBrowserTabId) {
      const tab = browserTabs.find((t) => t.id === activeBrowserTabId)
      if (!tab || !tabEligibleForMiniPlayer(tab)) return null
      return tab
    }
    return null
  }, [workspaceView, pinnedSession, navApps, homePane, activeBrowserTabId, browserTabs])

  const closeWorkspaceMini = useCallback(() => {
    const tabId = workspaceMini?.tabId
    if (tabId) {
      const webview = findWorkspaceWebview(tabId)
      void pauseWorkspaceMedia(webview)
      void applyYoutubeMiniLayout(webview, false)
    }
    setWorkspaceMini(null)
  }, [workspaceMini?.tabId])

  const expandWorkspaceMini = useCallback(() => {
    const mini = workspaceMini
    if (!mini) return
    void applyYoutubeMiniLayout(findWorkspaceWebview(mini.tabId), false)
    setWorkspaceMini(null)
    setPage('stream')
    setArea('work')
    if (mini.pinId) {
      setWorkspaceView('pinned')
      return
    }
    setWorkspaceView('home')
    setHomePane('browser')
    setActiveBrowserTabId(mini.tabId)
  }, [workspaceMini])

  const tryDockWorkspaceMini = useCallback(async (): Promise<WorkspaceMini | null> => {
    const tab = resolveWorkspaceMediaTab()
    if (!tab) return null
    const webview = findWorkspaceWebview(tab.id)
    const playing = await getWorkspaceWebviewPlayback(webview)
    if (!playing) return null
    return {
      tabId: tab.id,
      label: tab.title,
      url: tab.url,
      pinId: tab.pinId
    }
  }, [resolveWorkspaceMediaTab])

  const dockWorkspaceMini = useCallback(async (): Promise<boolean> => {
    const mini = await tryDockWorkspaceMini()
    if (!mini) return false
    setWorkspaceMini(mini)
    return true
  }, [tryDockWorkspaceMini])

  const withMediaLeave = useCallback(
    (action: () => void) => {
      if (page === 'navapp' && activeNavAppId) {
        void dockNavAppMini().finally(action)
        return
      }
      if (resolveWorkspaceMediaTab()) {
        void tryDockWorkspaceMini().then((mini) => {
          action()
          if (!mini) return
          requestAnimationFrame(() => {
            setWorkspaceMini(mini)
          })
        })
        return
      }
      action()
    },
    [page, activeNavAppId, dockNavAppMini, resolveWorkspaceMediaTab, tryDockWorkspaceMini]
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
    if (!workspaceMini) return
    const el = findWorkspaceWebview(workspaceMini.tabId)
    void applyYoutubeMiniLayout(el, false)
    forceWebviewRepaint(el)
    const t = window.setTimeout(() => forceWebviewRepaint(findWorkspaceWebview(workspaceMini.tabId)), 300)
    return () => window.clearTimeout(t)
  }, [workspaceMini])

  useEffect(() => {
    if (!workspaceMini) return
    const verify = async () => {
      const playing = await getWorkspaceWebviewPlayback(findWorkspaceWebview(workspaceMini.tabId))
      if (!playing) closeWorkspaceMini()
    }
    const interval = window.setInterval(() => void verify(), 4000)
    return () => window.clearInterval(interval)
  }, [workspaceMini, closeWorkspaceMini])

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
      if (workspaceMini?.pinId === app.id) {
        expandWorkspaceMini()
        return
      }
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
    withMediaLeave(() => {
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
    withMediaLeave(() => {
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
      withMediaLeave(() => openNavApp(item.navAppId))
      return
    }
    withMediaLeave(() => {
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
    withMediaLeave(() => {
      setPage('build')
      setWorkspaceView('home')
      setFocusMeetingItemId(null)
    })
  }

  const goHome = () => {
    withMediaLeave(() => {
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

  const importFromChrome = useCallback(
    async (reloadTabId?: string) => {
      const result = await window.notchDesktop?.importChromeCookies?.()
      if (!result?.ok) {
        window.alert(result?.error ?? 'Could not import cookies from Chrome.')
        return
      }
      window.alert(
        `Imported ${result.imported} cookies from Chrome${result.skipped ? ` (${result.skipped} skipped)` : ''}. Reload tabs to apply.`
      )
      if (reloadTabId) reloadBrowserTab(reloadTabId)
    },
    [reloadBrowserTab]
  )

  const selectHomeChat = useCallback(() => {
    withMediaLeave(() => {
      setWorkspaceView('home')
      setHomePane('chat')
    })
  }, [withMediaLeave])

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
  const activePinnedAppId =
    workspaceView === 'pinned' && pinnedSession ? pinnedSession.pinId : null
  const showWorkspaceRail = page === 'stream' && area === 'work' && workspaceView === 'home'
  const homeBrowserActive =
    workspaceView === 'home' && homePane === 'browser' && browserTabs.length > 0
  const browserMode = pinnedActive || homeBrowserActive
  const homeBrowserNav = useWebviewNavigation(homeBrowserActive ? activeBrowserTabId : null)
  const browserContextTabId = browserMode
    ? pinnedActive
      ? (pinnedSession?.tab.id ?? null)
      : activeBrowserTabId
    : null

  const refreshBrowserPageContext = useCallback(async () => {
    if (!browserContextTabId) {
      setBrowserPageContext(null)
      return
    }
    const ctx = await captureWorkspaceBrowserContext(browserContextTabId)
    setBrowserPageContext(ctx)
  }, [browserContextTabId])

  useEffect(() => {
    if (!browserMode) {
      setBrowserPageContext(null)
      return
    }
    void refreshBrowserPageContext()
  }, [browserMode, browserContextTabId, refreshBrowserPageContext])

  const composeAction = composeActionFromText(compose)
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
          text: meetActionTextForSubmit(compose),
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
        if (composeAction.provider === 'meet') {
          window.dispatchEvent(new CustomEvent('notch:calendars-updated'))
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
    const onLinkedInThread = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId: string; senderName?: string }>).detail
      const threadId = detail?.threadId?.trim()
      if (!threadId) return
      const url = isSyntheticLinkedInThreadId(threadId)
        ? 'https://www.linkedin.com/messaging/'
        : `https://www.linkedin.com/messaging/thread/${threadId}/`
      window.dispatchEvent(
        new CustomEvent('notch:open-workspace', {
          detail: {
            url,
            title: 'LinkedIn',
            source: 'linkedin',
            pinId: 'linkedin',
            tabKind: 'pinned'
          }
        })
      )
    }
    window.addEventListener('notch:open-linkedin-thread', onLinkedInThread)
    return () => window.removeEventListener('notch:open-linkedin-thread', onLinkedInThread)
  }, [])

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

        for (const evt of data.events ?? []) {
          const tab = tabFromCalendarEvent(evt)
          if (!tab) continue

          const startsIn = evt.startsAt - now
          const isLive = evt.live || (startsIn <= 0 && !evt.ended)
          const startsSoon = startsIn > 0 && startsIn <= 15 * 60_000

          // Live / imminent meetings: toast notifications only — never auto-open or hijack focus.
          if (isLive || startsSoon) continue

          const morningPrep =
            evt.dayIndex === 0 && startsIn > 15 * 60_000 && startsIn <= 4 * 3_600_000
          if (!morningPrep) continue
          if (wasCalendarShaded(evt.id) || autoShadedRef.current.has(tab.id)) continue

          autoShadedRef.current.add(tab.id)
          markCalendarShaded(evt.id)
          openBrowserTab({ ...tab, autoOpened: true }, { activate: false })
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
  const contextRailCollapsed =
    showWorkspaceRail || pinnedActive || homeBrowserActive
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
  const hasRightRail =
    page === 'stream' && (showThreadRail || showPostCallRail || showContextRail)

  const slideBladeLayout = showWorkspaceRail && !pinnedActive

  useEffect(() => {
    if (!browserMode) return
    repaintAllWorkspaceWebviews()
    const t1 = window.setTimeout(repaintAllWorkspaceWebviews, 80)
    const t2 = window.setTimeout(repaintAllWorkspaceWebviews, 280)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [
    browserMode,
    navOpen,
    browserSidebarCollapsed,
    workspaceRailCollapsed,
    feedRailCollapsed,
    showContextRail,
    hasRightRail,
    activeBrowserTabId
  ])

  const navAppPlayerMode =
    !activeNavApp ? 'off' : page === 'navapp' && !navAppMini ? 'full' : navAppMini ? 'mini' : 'off'

  const pinnedMiniActive =
    workspaceMini != null &&
    pinnedSession != null &&
    workspaceMini.tabId === pinnedSession.tab.id
  const browserMiniTabId =
    workspaceMini != null && !workspaceMini.pinId ? workspaceMini.tabId : null

  return (
    <LinkedInPerceptionProvider backgroundActive={linkedInPinned}>
    <div
      className={`x-app ${navOpen ? 'x-app-nav-open' : 'x-app-nav-closed'} ${showThreadRail ? 'x-app-thread-open' : ''} ${showPostCallRail ? 'x-app-post-call-open' : ''} ${browserMode ? 'x-app-browser-mode' : ''} ${showWorkspaceRail ? 'x-app-workspace-open' : ''} ${page === 'navapp' ? 'x-app-nav-app' : page !== 'stream' ? 'x-app-utility' : 'x-app-stream'} ${!hasRightRail ? 'x-app-no-rail' : ''}${slideBladeLayout ? ' x-app-home-chat' : ''}${navAppMini ? ' x-app-nav-app-mini' : ''}${workspaceMini ? ' x-app-workspace-mini' : ''}${pinnedActive ? ' x-app-pinned-app' : ''}`}
    >
      {linkedInPinned ? <LinkedInBackgroundPerception /> : null}
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
            activePinnedAppId={activePinnedAppId}
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
            onOpenNotes={() => setPage('notes')}
          />
        </main>
      ) : page === 'build' ? (
        <main className="x-main x-main-utility">
          <BuildDojo
            events={events}
            onOpenIntegrations={() => setPage('integrations')}
          />
        </main>
      ) : page === 'notes' ? (
        <main className="x-main x-main-utility">
          <NotesView onOpenIntegrations={() => setPage('integrations')} />
        </main>
      ) : page === 'mind' ? (
        <main className="x-main x-main-utility x-main-mind-graph">
          <MindGraphView />
        </main>
      ) : page === 'pipeline' ? (
        <main className="x-main x-main-utility x-main-pipeline">
          <PipelineView
            onOpenMeeting={(itemId) => {
              setPage('stream')
              setArea('feed')
              setThreadTarget({ itemId })
            }}
            onOpenBuild={() => setPage('build')}
            onOpenAgentQueue={() => {
              setPage('stream')
              setArea('feed')
              window.dispatchEvent(new Event('notch:open-agent-inbox'))
            }}
          />
        </main>
      ) : page === 'navapp' ? (
        <main className="x-main x-main-nav-app" aria-hidden="true" />
      ) : (
        <HomeChatProvider>
          <>
          <div className={`x-channel ${showThreadRail || showPostCallRail ? 'x-channel-has-thread' : ''}${hasRightRail ? ' x-channel-has-rail' : ''}`}>
          <div className="x-channel-main">
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
                    canGoBack={homeBrowserNav.canGoBack}
                    canGoForward={homeBrowserNav.canGoForward}
                    onBack={homeBrowserNav.goBack}
                    onForward={homeBrowserNav.goForward}
                    onImportChrome={() => void importFromChrome(activeBrowserTab.id)}
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
                      miniTabId={browserMiniTabId}
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
                  onImportChrome={() => void importFromChrome(pinnedSession.tab.id)}
                  railCollapsed={workspaceRailCollapsed}
                  onToggleRail={toggleWorkspaceRail}
                />
                <main className="x-main x-main-work x-main-home x-main-workspace x-browser-content x-workspace-media-slot" />
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

            {streamError ? (
              <p className="x-stream-error-banner" role="status">
                {streamError}
              </p>
            ) : null}

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
                            : 'Start a meet with @name right now · @mind · @claude · @monday…'
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
                          {composeBusy
                            ? 'Running…'
                            : composeAction?.provider === 'meet'
                              ? 'Schedule Meet'
                              : composeAction
                                ? 'Run action'
                                : 'Post'}
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
                      onRefresh={refreshStream}
                    />
                  ))}
              </>
            )}
          </main>
          )}
          {pinnedSession ? (
            <div
              className={`x-workspace-media-layer${
                pinnedMiniActive
                  ? ' x-workspace-media-layer--mini'
                  : pinnedActive
                    ? ' x-workspace-media-layer--full'
                    : ' x-workspace-media-layer--parked'
              }`}
              aria-hidden={!pinnedActive && !pinnedMiniActive}
            >
              {pinnedMiniActive && workspaceMini ? (
                <header className="x-nav-app-player-bar">
                  <span className="x-nav-app-player-title">{workspaceMini.label}</span>
                  <div className="x-nav-app-player-actions">
                    <button
                      type="button"
                      className="x-nav-app-player-btn"
                      onClick={expandWorkspaceMini}
                      title="Expand"
                    >
                      Expand
                    </button>
                    <button
                      type="button"
                      className="x-nav-app-player-btn x-nav-app-player-btn-external"
                      onClick={() =>
                        openBrowserLink(workspaceMini.url, {
                          forceExternal: true,
                          title: workspaceMini.label
                        })
                      }
                      title="Open in browser"
                    >
                      ↗
                    </button>
                    <button
                      type="button"
                      className="x-nav-app-player-btn x-nav-app-player-btn-close"
                      onClick={closeWorkspaceMini}
                      title="Close"
                    >
                      ×
                    </button>
                  </div>
                </header>
              ) : null}
              <WorkspaceBrowser
                tabs={[pinnedSession.tab]}
                activeId={pinnedActive || pinnedMiniActive ? pinnedSession.tab.id : ''}
                reloadKeys={tabReloadKeys}
                onTabUrlChange={(_, url) => syncPinnedTabUrl(url)}
              />
            </div>
          ) : null}
          {workspaceMini && !workspaceMini.pinId ? (
            <WorkspaceMiniPlayer
              label={workspaceMini.label}
              url={workspaceMini.url}
              hasRail={false}
              onExpand={expandWorkspaceMini}
              onClose={closeWorkspaceMini}
            />
          ) : null}
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
            <aside className="x-rail x-col-rail x-rail-context x-rail-dock">
              <RailResizeHandle />
              <ContextRail
                events={streamFiltered}
                onOpenHome={goHome}
                onOpenBuildDojo={openAgentsFeed}
                railContext={{ page, area, tab, workspaceMode: browserMode }}
                browserTabId={browserContextTabId}
                browserPageContext={browserPageContext}
                onRefreshBrowserPageContext={refreshBrowserPageContext}
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
                  onSelectContext: selectContext,
                  onRefresh: refreshStream
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
          {showWorkspaceRail && !threadTarget && !showPostCallRail ? (
            <button
              type="button"
              className={`x-context-rail-tab${workspaceRailCollapsed ? ' x-context-rail-tab-collapsed' : ''}`}
              aria-label={workspaceRailCollapsed ? 'Show side panel' : 'Hide side panel'}
              title={workspaceRailCollapsed ? 'Show side panel' : 'Hide side panel'}
              onClick={toggleWorkspaceRail}
            >
              {workspaceRailCollapsed ? '‹' : '›'}
            </button>
          ) : null}
          </div>
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

      <AppToastStack />
    </div>
    </LinkedInPerceptionProvider>
  )
}
