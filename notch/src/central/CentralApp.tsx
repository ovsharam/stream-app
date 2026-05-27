import { useEffect, useRef, useState } from 'react'
import { FeedPost } from './FeedPost'
import { RailWidgets } from './RailWidgets'
import { IntegrationsPanel } from './IntegrationsPanel'
import { SettingsPanel } from './SettingsPanel'
import { ThemeMenu } from './ThemeMenu'
import { ThreadBlade } from './ThreadBlade'
import { WorkspaceView } from './WorkspaceView'
import { useCentralStream } from './useCentralStream'
import { parseComposeCommand } from '@shared/compose'
import { clusterApi } from '../lib/api'
import { toWorkspaceTab, type WorkspaceTab } from './workspace'
import {
  IconBell,
  IconBookmark,
  IconEmoji,
  IconGif,
  IconHome,
  IconIntegrations,
  IconMedia,
  IconNotch,
  IconSearch,
  IconSettings,
  IconSpark,
  IconUser
} from './Icons'

type Tab = 'foryou' | 'live' | 'signals'
type Page = 'stream' | 'settings' | 'integrations'

const NAV: {
  id: string
  label: string
  tab?: Tab
  page?: Page
  badge?: boolean
}[] = [
  { id: 'foryou', label: 'Home', tab: 'foryou' },
  { id: 'live', label: 'Live', tab: 'live', badge: true },
  { id: 'signals', label: 'Signals', tab: 'signals' },
  { id: 'bookmarks', label: 'Graph' },
  { id: 'integrations', label: 'Integrations', page: 'integrations' },
  { id: 'settings', label: 'Settings', page: 'settings' }
]

function streamItemId(event: { id: string; meta?: Record<string, unknown> }): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function NavIcon({ id }: { id: string }) {
  const cls = 'x-nav-icon'
  switch (id) {
    case 'foryou':
      return <IconHome className={cls} />
    case 'live':
      return <IconBell className={cls} />
    case 'signals':
      return <IconSpark className={cls} />
    case 'bookmarks':
      return <IconBookmark className={cls} />
    case 'integrations':
      return <IconIntegrations className={cls} />
    case 'settings':
      return <IconSettings className={cls} />
    default:
      return <IconUser className={cls} />
  }
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

  const { events, live } = useCentralStream()
  const [tab, setTab] = useState<Tab>('foryou')
  const [page, setPage] = useState<Page>('stream')
  const [compose, setCompose] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [composeToast, setComposeToast] = useState<string | null>(null)
  const [composeError, setComposeError] = useState<string | null>(null)
  const [contextItemId, setContextItemId] = useState<string | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  const themeBtnRef = useRef<HTMLButtonElement>(null)
  const [threadTarget, setThreadTarget] = useState<{ itemId: string; day?: string } | null>(null)
  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(persistedTabs)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    persistedActive ?? persistedTabs.at(-1)?.id ?? null
  )

  const filtered =
    tab === 'live'
      ? events.filter((e) =>
          ['transcript_live', 'assist', 'transcript_done'].includes(e.kind)
        )
      : tab === 'signals'
        ? events.filter((e) => ['signal', 'insight', 'build_prompt'].includes(e.kind))
        : events.filter(
            (e) =>
              e.kind !== 'transcript_live' &&
              !(e.source === 'meet' && e.joinable && e.meta?.live === 'true')
          )

  const feedTabs: { id: Tab; label: string }[] = [
    { id: 'foryou', label: 'For you' },
    { id: 'live', label: 'Live' },
    { id: 'signals', label: 'Signals' }
  ]

  const onNav = (item: (typeof NAV)[0]) => {
    if (item.page) {
      setPage(item.page)
      return
    }
    setPage('stream')
    if (item.tab) setTab(item.tab)
  }

  const openWorkspace = (event: (typeof events)[number]) => {
    const tab = toWorkspaceTab(event)
    if (!tab) return

    setWorkspaceTabs((prev) => {
      const existing = prev.find((t) => t.id === tab.id)
      if (existing) {
        setActiveWorkspaceId(existing.id)
        return prev
      }
      setActiveWorkspaceId(tab.id)
      return [...prev, tab]
    })
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

  const submitCompose = async () => {
    if (!composeAction || composeBusy) return
    setComposeBusy(true)
    setComposeError(null)
    setComposeToast(null)
    try {
      const result = await clusterApi.runAction({
        text: compose,
        contextItemId: contextItemId ?? undefined
      })
      setCompose('')
      if (result.ok) {
        setComposeToast(result.message)
        if (composeAction.intent === 'send') setContextItemId(null)
      } else {
        setComposeError(result.message)
      }
      window.dispatchEvent(new Event('stream:user-role'))
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setComposeBusy(false)
    }
  }

  useEffect(() => {
    if (!composeToast) return
    const t = window.setTimeout(() => setComposeToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [composeToast])

  useEffect(() => {
    localStorage.setItem('stream.central.workspaceTabs', JSON.stringify(workspaceTabs))
  }, [workspaceTabs])

  useEffect(() => {
    if (activeWorkspaceId) localStorage.setItem('stream.central.activeWorkspaceId', activeWorkspaceId)
    else localStorage.removeItem('stream.central.activeWorkspaceId')
  }, [activeWorkspaceId])

  return (
    <div
      className={`x-app ${threadTarget ? 'x-app-thread-open' : ''} ${page !== 'stream' ? 'x-app-utility' : 'x-app-stream'}`}
    >
      {typeof window !== 'undefined' &&
      (window.notchDesktop != null || /Electron/i.test(navigator.userAgent)) ? (
        <div className="x-macos-titlebar" aria-hidden="true" />
      ) : null}
      <div className="x-shell">
        <aside className="x-nav x-nav-compact">
        <div className="x-logo" title="Notch">
          <IconNotch className="x-logo-icon" />
        </div>

        <nav className="x-nav-list">
          {NAV.map((item) => {
            const active =
              item.page != null
                ? page === item.page
                : page === 'stream' && item.tab === tab
            return (
              <button
                key={item.id}
                type="button"
                className={`x-nav-item x-nav-item-compact ${active ? 'active' : ''}`}
                onClick={() => onNav(item)}
                title={item.label}
              >
                <NavIcon id={item.id} />
                {item.badge && live && <span className="x-nav-badge" />}
              </button>
            )
          })}
          <button
            ref={themeBtnRef}
            type="button"
            className="x-nav-item x-nav-item-compact"
            onClick={() => setThemeOpen((v) => !v)}
            title="Theme"
            aria-expanded={themeOpen}
            aria-haspopup="dialog"
          >
            <span className="x-nav-theme-dot" />
          </button>
        </nav>

        <ThemeMenu
          open={themeOpen}
          anchorRef={themeBtnRef}
          onClose={() => setThemeOpen(false)}
        />

        <div className="x-nav-user x-nav-user-compact" title="Apoorva @ae">
          <div className="x-avatar x-avatar-user">A</div>
        </div>
      </aside>

      {page === 'settings' ? (
        <main className="x-main x-main-utility">
          <SettingsPanel />
        </main>
      ) : page === 'integrations' ? (
        <main className="x-main x-main-utility">
          <IntegrationsPanel />
        </main>
      ) : (
          <>
          <div className={`x-channel ${threadTarget ? 'x-channel-thread' : ''}`}>
          <main className={`x-main x-col-feed ${threadTarget ? 'x-col-feed-in-thread' : ''}`}>
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
            </header>
            {workspaceTabs.length > 0 && (
            <div className="x-workspace-tabs">
              <button
                type="button"
                className={`x-workspace-tab x-workspace-tab-feed ${!activeWorkspaceId ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceId(null)}
              >
                Feed
              </button>
              {workspaceTabs.map((t) => (
                <div
                  key={t.id}
                  className={`x-workspace-tab ${activeWorkspaceId === t.id ? 'active' : ''}`}
                >
                  <button type="button" onClick={() => setActiveWorkspaceId(t.id)}>
                    {t.title}
                  </button>
                  <button type="button" className="x-workspace-close" onClick={() => closeWorkspace(t.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            )}

            {activeWorkspace ? (
              <WorkspaceView tab={activeWorkspace} />
            ) : (
              <>
                <div className="x-compose">
                  <div className="x-avatar x-avatar-user">A</div>
                  <div className="x-compose-body">
                    {contextEvent && (
                      <div className="x-compose-context">
                        <span>
                          Replying to:{' '}
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
                      placeholder="@monday · @gmail · @slack · @discord · @x · @perplexity — e.g. @monday Fix webhook policy"
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

                {filtered.map((e, i) => (
                  <FeedPost
                    key={e.id}
                    event={e}
                    isNew={live && i === 0}
                    isContext={contextItemId === streamItemId(e)}
                    activeThreadId={threadTarget?.itemId ?? null}
                    onOpenWorkspace={openWorkspace}
                    onOpenThread={(itemId, day) => {
                      setContextItemId(itemId)
                      setThreadTarget({ itemId, day })
                    }}
                    onSelectContext={setContextItemId}
                  />
                ))}

                {live && (
                  <div className="x-loading">
                    <span /><span /><span />
                  </div>
                )}
              </>
            )}

          </main>

          {threadTarget && (
            <ThreadBlade
              itemId={threadTarget.itemId}
              day={threadTarget.day}
              contextItemId={contextItemId ?? threadTarget.itemId}
              onClose={() => setThreadTarget(null)}
            />
          )}
          </div>

          {!threadTarget && (
            <aside className="x-rail x-col-rail">
              <div className="x-search">
                <IconSearch className="x-search-icon" />
                <input placeholder="Search" readOnly />
              </div>
              <RailWidgets />
            </aside>
          )}
        </>
      )}
      </div>
    </div>
  )
}
