import { openBrowserLink } from '../lib/api'
import type { WorkspaceTab } from './workspace'

type Props = {
  homeLabel: string
  tabs: WorkspaceTab[]
  activeWorkspaceId: string | null
  activeTab?: WorkspaceTab | null
  onSelectHome: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  showRailToggle?: boolean
  railCollapsed?: boolean
  onToggleRail?: () => void
}

function tabIcon(source: WorkspaceTab['source']): string {
  switch (source) {
    case 'meet':
      return '▶'
    case 'gmail':
      return '✉'
    case 'monday':
      return '◉'
    case 'slack':
      return 'S'
    case 'calendar':
      return '📅'
    case 'gdocs':
      return 'G'
    case 'youtube':
      return '▶'
    case 'linkedin':
      return 'in'
    case 'calcom':
      return 'C'
    case 'discord':
      return 'D'
    case 'github':
      return '⎇'
    default:
      return '◆'
  }
}

export function WorkspaceTabBar({
  homeLabel,
  tabs,
  activeWorkspaceId,
  activeTab,
  onSelectHome,
  onSelectTab,
  onCloseTab,
  showRailToggle,
  railCollapsed,
  onToggleRail
}: Props) {
  if (tabs.length === 0) return null

  return (
    <header className="x-workspace-chrome">
      <div className="x-workspace-tabs" role="tablist" aria-label="Workspace">
        <button
          type="button"
          role="tab"
          aria-selected={!activeWorkspaceId}
          className={`x-workspace-tab x-workspace-tab-home ${!activeWorkspaceId ? 'active' : ''}`}
          onClick={onSelectHome}
        >
          <span className="x-workspace-tab-icon" aria-hidden>
            ⌂
          </span>
          <span className="x-workspace-tab-label">{homeLabel}</span>
        </button>
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={activeWorkspaceId === t.id}
            className={`x-workspace-tab ${activeWorkspaceId === t.id ? 'active' : ''} ${t.autoOpened ? 'x-workspace-tab-auto' : ''}`}
          >
            <button type="button" className="x-workspace-tab-main" onClick={() => onSelectTab(t.id)}>
              <span className={`x-workspace-tab-icon x-workspace-tab-icon-${t.source}`} aria-hidden>
                {tabIcon(t.source)}
              </span>
              <span className="x-workspace-tab-label" title={t.title}>
                {t.title}
              </span>
            </button>
            <button
              type="button"
              className="x-workspace-close"
              aria-label={`Close ${t.title}`}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(t.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {activeTab ? (
        <div className="x-workspace-url" title={activeTab.url}>
          <span className="x-workspace-url-text">{activeTab.url}</span>
        </div>
      ) : null}

      <div className="x-workspace-chrome-actions">
        {activeTab ? (
          <button
            type="button"
            className="x-workspace-icon-btn"
            aria-label="Open in browser"
            title="Open in browser"
            onClick={() =>
              openBrowserLink(activeTab.url, {
                forceExternal: true,
                title: activeTab.title,
                source: activeTab.source
              })
            }
          >
            ↗
          </button>
        ) : null}
        {showRailToggle && onToggleRail ? (
          <button
            type="button"
            className={`x-workspace-icon-btn x-workspace-icon-btn-rail${railCollapsed ? ' active' : ''}`}
            aria-label={railCollapsed ? 'Show panel' : 'Hide panel'}
            title={railCollapsed ? 'Show panel' : 'Hide panel'}
            onClick={onToggleRail}
          >
            {railCollapsed ? '◧' : '◨'}
          </button>
        ) : null}
      </div>
    </header>
  )
}
