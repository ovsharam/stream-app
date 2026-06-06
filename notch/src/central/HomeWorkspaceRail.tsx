import { BROWSER_QUICK_LINKS } from './browserUrl'
import { useHomeChat } from './homeChatContext'
import { groupSessionsByDate } from './homeChatStore'
import { IconGlobe, IconSpark } from './Icons'
import type { HomePane, WorkspaceTab } from './workspace'

type Props = {
  homePane: HomePane
  browserTabs: WorkspaceTab[]
  activeBrowserTabId: string | null
  browserExpanded?: boolean
  collapsed?: boolean
  onSelectChat: () => void
  onSelectBrowser: () => void
  onToggleBrowserExpanded?: () => void
  onSelectBrowserTab: (id: string) => void
  onCloseBrowserTab: (id: string) => void
  onNewBrowserTab: (url: string) => void
  onToggleCollapsed: () => void
}

function tabIcon(source: WorkspaceTab['source']): string {
  switch (source) {
    case 'gmail':
      return '✉'
    case 'gdocs':
      return 'G'
    case 'youtube':
      return '▶'
    case 'linkedin':
      return 'in'
    case 'monday':
      return '◉'
    case 'calcom':
      return 'C'
    case 'slack':
      return 'S'
    case 'github':
      return '⎇'
    case 'meet':
      return '▶'
    default:
      return '◆'
  }
}

export function HomeWorkspaceRail({
  homePane,
  browserTabs,
  activeBrowserTabId,
  collapsed,
  onSelectChat,
  onSelectBrowserTab,
  onCloseBrowserTab,
  onNewBrowserTab,
  onToggleCollapsed
}: Props) {
  const chat = useHomeChat()
  const chatGroups = groupSessionsByDate(chat.sessions)

  const selectChat = (id: string) => {
    onSelectChat()
    chat.selectSession(id)
  }

  const startNewChat = () => {
    onSelectChat()
    chat.newChat()
  }

  return (
    <aside className={`x-browser-sidebar x-home-workspace-rail${collapsed ? ' x-browser-sidebar-collapsed' : ''}`}>
      <div className="x-browser-sidebar-head">
        {!collapsed ? <span className="x-browser-sidebar-title">Home</span> : null}
        <button
          type="button"
          className="x-browser-sidebar-icon-btn x-browser-sidebar-icon-btn-end"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav className="x-home-workspace-nav" aria-label="Home">
        {!collapsed ? (
          <>
            <section className="x-home-rail-section" aria-label="Chat">
              <p className="x-home-rail-section-label">Chat</p>
              <div className="x-home-rail-stack">
                <button type="button" className="x-home-rail-new" onClick={startNewChat}>
                  <span className="x-home-rail-new-plus" aria-hidden>
                    +
                  </span>
                  <span>New chat</span>
                </button>
                {chatGroups.length === 0 ? (
                  <p className="x-home-rail-empty">No chats yet</p>
                ) : (
                  chatGroups.map((group) => (
                    <div key={group.label} className="x-home-rail-group">
                      <p className="x-home-rail-group-label">{group.label}</p>
                      {group.sessions.map((session) => {
                        const active = homePane === 'chat' && session.id === chat.activeId
                        return (
                          <div
                            key={session.id}
                            className={`x-home-rail-row x-home-rail-tab${active ? ' active' : ''}`}
                          >
                            <button
                              type="button"
                              className="x-home-rail-tab-main"
                              onClick={() => selectChat(session.id)}
                              title={session.title}
                            >
                              <IconSpark className="x-home-rail-icon" />
                              <span className="x-home-rail-label">{session.title}</span>
                            </button>
                            <button
                              type="button"
                              className="x-home-rail-close"
                              aria-label={`Delete ${session.title}`}
                              onClick={() => chat.deleteSession(session.id)}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="x-home-rail-section" aria-label="Browser tabs">
              <p className="x-home-rail-section-label">Tabs</p>
              <div className="x-home-rail-stack">
                <button
                  type="button"
                  className="x-home-rail-new"
                  onClick={() => onNewBrowserTab('https://www.google.com')}
                >
                  <IconGlobe className="x-home-rail-icon" />
                  <span>New tab</span>
                </button>

                {browserTabs.length === 0 ? (
                  <p className="x-home-rail-empty">No tabs open</p>
                ) : (
                  <div className="x-home-rail-tabs" role="tablist" aria-label="Browser tabs">
                    {browserTabs.map((t) => (
                      <div
                        key={t.id}
                        role="tab"
                        aria-selected={activeBrowserTabId === t.id && homePane === 'browser'}
                        className={`x-home-rail-row x-home-rail-tab${activeBrowserTabId === t.id && homePane === 'browser' ? ' active' : ''}`}
                      >
                        <button
                          type="button"
                          className="x-home-rail-tab-main"
                          onClick={() => onSelectBrowserTab(t.id)}
                          title={t.title}
                        >
                          <span className={`x-home-rail-favicon x-home-rail-favicon-${t.source}`} aria-hidden>
                            {tabIcon(t.source)}
                          </span>
                          <span className="x-home-rail-label">{t.title}</span>
                        </button>
                        <button
                          type="button"
                          className="x-home-rail-close"
                          aria-label={`Close ${t.title}`}
                          onClick={() => onCloseBrowserTab(t.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="x-home-rail-quick">
                  {BROWSER_QUICK_LINKS.map((link) => (
                    <button
                      key={link.url}
                      type="button"
                      className="x-home-rail-quick-link"
                      onClick={() => onNewBrowserTab(link.url)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </nav>
    </aside>
  )
}
