import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClusterSearchHit } from '@shared/cluster'
import { FeedPost } from './FeedPost'
import { HomeChatProvider } from './homeChatContext'
import { WorkView } from './WorkView'
import { ContextRail } from './ContextRail'
import { IntegrationsPanel } from './IntegrationsPanel'
import { SideNav, type NavTarget, type Page } from './SideNav'
import { NavAppPlayer } from './NavAppPlayer'
import { getNavApp, useNavApps } from './navAppsStore'
import { SettingsPanel } from './SettingsPanel'
import { ThemeMenu } from './ThemeMenu'
import { useTheme } from './useTheme'
import { ThreadBlade } from './ThreadBlade'
import { WorkspaceView } from './WorkspaceView'
import { WorkspaceTabBar } from './WorkspaceTabBar'
import { FeedSearchBar, filterFeedEvents } from './FeedSearchBar'
import { useCentralStream } from './useCentralStream'
import {
  completeAgent,
  createAgentAbortSignal,
  startAgent,
  updateAgentStatus
} from './runningAgentsStore'
import { parseComposeCommand } from '@shared/compose'
import { clusterApi, integrationApi } from '../lib/api'
import { tabFromCalendarEvent, tabFromUrl, toWorkspaceTab, type WorkspaceTab } from './workspace'
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

export function CentralApp() {
  const persistedTabs = (() => {
    try {
      const raw = localStorage.getItem('stream.central.workspaceTabs')
      return raw ? (JSON.parse(raw) as WorkspaceTab[]) : []
    } catch {
      return []
    }
  })()
  const persistedActive = (() => {
    try {
      return localStorage.getItem('stream.central.activeWorkspaceId')
    } catch {
      return null
    }
  })()

  const { events, live, syncing } = useCentralStream()
  const [area, setArea] = useState<Area>('work')
  const [tab, setTab] = useState<Tab>('foryou')
  const [page, setPage] = useState<Page>('stream')
  const [focusMeetingItemId, setFocusMeetingItemId] = useState<string | null>(null)
  const [compose, setCompose] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [composeToast, setComposeToast] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [contextItemId, setContextItemId] = useState<string | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const [threadTarget, setThreadTarget] = useState<{ itemId: string; day?: string } | null>(null)
  const [feedQuery, setFeedQuery] = useState('')
  const [feedRailCollapsed, setFeedRailCollapsed] = useState(() => {
    try {
      return localStorage.getItem('notch.feedRailCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(persistedTabs)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    persistedActive ?? persistedTabs.at(-1)?.id ?? null
  )
  const [homeChatRail, setHomeChatRail] = useState(false)
  const { theme, setTheme } = useTheme()
  const { apps: navApps, add: addNavApp, remove: removeNavApp, pinCatalog: pinNavApp } = useNavApps()
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
    void window.notchDesktop?.setNavAppTheme?.(theme)
  }, [theme])

  const openNavApp = (appId: string) => {
    setPage('navapp')
    setActiveNavAppId(appId)
    setNavAppMini(false)
    setActiveWorkspaceId(null)
    setFocusMeetingItemId(null)
  }

  const resetToHomeChat = useCallback(() => {
    closeNavApp()
    setThreadTarget(null)
    setFeedQuery('')
    setContextItemId(null)
    setFocusMeetingItemId(null)
    setActiveWorkspaceId(null)
    setPage('stream')
    setArea('work')
    setTab('foryou')
  }, [closeNavApp])

  useEffect(() => {
    resetToHomeChat()
  }, [resetToHomeChat])

  useEffect(() => {
    return window.notchDesktop?.onNavAppRendererReady?.(() => resetToHomeChat())
  }, [resetToHomeChat])

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

  const feedFiltered = useMemo(
    () => filterFeedEvents(filtered, feedQuery),
    [filtered, feedQuery]
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
      setArea('work')
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
      setActiveWorkspaceId(null)
    })
  }

  const openAgentsFeed = () => {
    withNavAppLeave(() => {
      setPage('stream')
      setArea('feed')
      setTab('signals')
      setActiveWorkspaceId(null)
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
      setActiveWorkspaceId(null)
    })
  }

  const openWorkspaceTab = (tab: WorkspaceTab, opts?: { activate?: boolean }) => {
    setWorkspaceTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id)
      if (existing) {
        if (opts?.activate !== false) setActiveWorkspaceId(existing.id)
        return prev
      }
      if (opts?.activate !== false) setActiveWorkspaceId(tab.id)
      return [...prev, tab]
    })
  }

  const openWorkspace = (event: (typeof events)[number]) => {
    const tab = toWorkspaceTab(event)
    if (!tab) return
    openWorkspaceTab(tab)
  }

  const closeWorkspace = (id: string) => {
    setWorkspaceTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeWorkspaceId === id) setActiveWorkspaceId(next.at(-1)?.id ?? null)
      return next
    })
  }

  const activeWorkspace = workspaceTabs.find((t) => t.id === activeWorkspaceId) ?? null
  const composeAction = parseComposeCommand(compose)
  const contextEvent = contextItemId
    ? events.find((e) => streamItemId(e) === contextItemId)
    : null
  const mondayContext = contextEvent?.source === 'monday'

  const selectContext = (itemId: string) => {
    setContextItemId(itemId)
    void clusterApi.markSeen(itemId).catch(() => {})
  }

  const submitCompose = async () => {
    if (!composeAction || composeBusy) return
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
      setCompose('')
      if (result.ok) {
        setComposeToast(result.message)
        if (composeAction.provider === 'mind') {
          window.dispatchEvent(new Event('notch:mind-updated'))
        }
        if (composeAction.provider === 'monday') {
          void integrationApi.syncSource('monday').catch(() => undefined)
        }
        if (composeAction.intent === 'send') setContextItemId(null)
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
    const onStarted = window.notch?.meeting?.onStarted?.(() => {
      setPage('stream')
      setArea('work')
      setFocusMeetingItemId(null)
    })
    const onEnded = window.notch?.meeting?.onEnded?.((result: unknown) => {
      const payload = result as { feedItemId?: string } | null
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
    localStorage.setItem('stream.central.workspaceTabs', JSON.stringify(workspaceTabs))
  }, [workspaceTabs])

  useEffect(() => {
    if (activeWorkspaceId) localStorage.setItem('stream.central.activeWorkspaceId', activeWorkspaceId)
    else localStorage.removeItem('stream.central.activeWorkspaceId')
  }, [activeWorkspaceId])

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{
        url: string
        title?: string
        source?: WorkspaceTab['source']
        summary?: string
        id?: string
        activate?: boolean
      }>).detail
      if (!detail?.url) return
      openWorkspaceTab(
        tabFromUrl(detail.url, {
          title: detail.title ?? 'Tab',
          source: detail.source,
          summary: detail.summary,
          id: detail.id
        }),
        { activate: detail.activate !== false }
      )
    }
    window.addEventListener('notch:open-workspace', onOpen)
    return () => window.removeEventListener('notch:open-workspace', onOpen)
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
          openWorkspaceTab({ ...tab, autoOpened: true }, { activate: false })
          if (isLive || startsSoon) focusTab = tab
        }

        if (focusTab) {
          setActiveWorkspaceId(focusTab.id)
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
  }, [page])

  const toggleFeedRail = useCallback(() => {
    setFeedRailCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('notch.feedRailCollapsed', next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const showContextRail =
    !threadTarget &&
    page !== 'navapp' &&
    !(page === 'stream' && area === 'work' && !activeWorkspace) &&
    !(area === 'feed' && feedRailCollapsed)

  const showThreadRail = Boolean(threadTarget) && page === 'stream' && area === 'feed'
  const hasRightRail = showThreadRail || showContextRail

  const homeChatCompactNav =
    page === 'stream' && area === 'work' && !activeWorkspace && !focusMeetingItemId && homeChatRail

  const navAppPlayerMode =
    !activeNavApp ? 'off' : page === 'navapp' && !navAppMini ? 'full' : navAppMini ? 'mini' : 'off'

  return (
    <div
      className={`x-app ${showThreadRail ? 'x-app-thread-open' : ''} ${page === 'navapp' ? 'x-app-nav-app' : page !== 'stream' ? 'x-app-utility' : 'x-app-stream'} ${!hasRightRail ? 'x-app-no-rail' : ''}${homeChatCompactNav ? ' x-app-home-chat' : ''}${navAppMini ? ' x-app-nav-app-mini' : ''}`}
    >
      {typeof window !== 'undefined' &&
      (window.notchDesktop != null || /Electron/i.test(navigator.userAgent)) ? (
        <div className="x-macos-titlebar" aria-hidden="true" />
      ) : null}
      <div className="x-shell">
        <SideNav
          page={page}
          area={area}
          tab={tab}
          live={live}
          compact={homeChatCompactNav}
          navApps={navApps}
          activeNavAppId={activeNavAppId}
          onNavigate={onNav}
          onOpenNavApp={openNavApp}
          onAddNavApp={addNavApp}
          onRemoveNavApp={(id) => {
            if (activeNavAppId === id) closeNavApp()
            removeNavApp(id)
          }}
          onGoHome={goHome}
          themeOpen={themeOpen}
          onThemeToggle={() => setThemeOpen((v) => !v)}
          themeBtnRef={themeBtnRef}
        />

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
      ) : page === 'navapp' ? (
        <main className="x-main x-main-nav-app" aria-hidden="true" />
      ) : (
        <HomeChatProvider onRailChange={setHomeChatRail}>
          <>
          <div className={`x-channel ${showThreadRail ? 'x-channel-has-thread' : ''}`}>
          <div className="x-channel-main">
          {workspaceTabs.length > 0 && (
            <WorkspaceTabBar
              homeLabel={area === 'work' ? 'Home' : 'Feed'}
              tabs={workspaceTabs}
              activeWorkspaceId={activeWorkspaceId}
              onSelectHome={() => setActiveWorkspaceId(null)}
              onSelectTab={setActiveWorkspaceId}
              onCloseTab={closeWorkspace}
            />
          )}
          <main
            className={`x-main x-col-feed ${threadTarget ? 'x-col-feed-in-thread' : ''} ${area === 'work' ? 'x-main-work x-main-home' : ''} ${activeWorkspace ? 'x-main-workspace' : ''}`}
          >
            {activeWorkspace ? (
              <WorkspaceView tab={activeWorkspace} />
            ) : area === 'work' ? (
              <WorkView
                events={events}
                live={live}
                syncing={syncing}
                focusMeetingItemId={focusMeetingItemId}
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
                totalCount={filtered.length}
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
                      <textarea
                        value={compose}
                        onChange={(e) => {
                          setCompose(e.target.value)
                          if (composeError) setComposeError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void submitCompose()
                          }
                        }}
                        placeholder={
                          mondayContext
                            ? '@monday: comment or move to Done · @monday create: new ticket'
                            : '@mind · @claude · @gemini · @cursor · @github · @gdocs · @gong · @perplexity · @gmail · @monday · @slack · @discord · @x'
                        }
                        rows={3}
                        className="x-compose-input"
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
          ) : showContextRail ? (
            <aside className="x-rail x-col-rail">
              <ContextRail events={events} onOpenHome={goHome} />
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
