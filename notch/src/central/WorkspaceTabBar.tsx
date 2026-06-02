import type { WorkspaceTab } from './workspace'

type Props = {
  homeLabel: string
  tabs: WorkspaceTab[]
  activeWorkspaceId: string | null
  onSelectHome: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
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
    default:
      return '◆'
  }
}

export function WorkspaceTabBar({
  homeLabel,
  tabs,
  activeWorkspaceId,
  onSelectHome,
  onSelectTab,
  onCloseTab
}: Props) {
  if (tabs.length === 0) return null

  return (
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
  )
}
