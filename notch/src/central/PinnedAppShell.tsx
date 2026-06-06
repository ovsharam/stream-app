import { BrowserChrome } from './BrowserChrome'
import type { PinnedAppSession } from './workspace'

type Props = {
  session: PinnedAppSession
  onBackHome: () => void
  onNavigate: (url: string) => void
  onReload: () => void
  onExternal: () => void
  onNewTab: () => void
  railCollapsed?: boolean
  onToggleRail?: () => void
}

export function PinnedAppShell({
  session,
  onBackHome,
  onNavigate,
  onReload,
  onExternal,
  onNewTab,
  railCollapsed,
  onToggleRail
}: Props) {
  return (
    <div className="x-pinned-app-shell">
      <header className="x-pinned-app-head">
        <button type="button" className="x-pinned-app-back" onClick={onBackHome}>
          ← Home
        </button>
        <span className="x-pinned-app-label">{session.tab.title}</span>
        <button type="button" className="x-pinned-app-new-tab" onClick={onNewTab}>
          + New tab
        </button>
      </header>
      <BrowserChrome
        tab={session.tab}
        onNavigate={onNavigate}
        onReload={onReload}
        onExternal={onExternal}
        railCollapsed={railCollapsed}
        onToggleRail={onToggleRail}
        workspaceMode
      />
    </div>
  )
}
