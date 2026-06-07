import type { WorkspaceTab } from './workspace'
import { WorkspaceView } from './WorkspaceView'

type Props = {
  tabs: WorkspaceTab[]
  activeId: string
  reloadKeys?: Record<string, number>
  miniTabId?: string | null
  onTabUrlChange?: (id: string, url: string) => void
}

/** Keeps one webview mounted per tab so switching tabs does not reload Google Docs / Meet. */
export function WorkspaceBrowser({ tabs, activeId, reloadKeys = {}, miniTabId = null, onTabUrlChange }: Props) {
  return (
    <div
      className={`x-workspace-browser-host${activeId || miniTabId ? ' x-workspace-browser-host-active' : ''}${miniTabId ? ' x-workspace-browser-host-mini' : ''}`}
    >
      <div className="x-workspace-browser">
        {tabs.map((tab) => (
          <WorkspaceView
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            miniPlayerTarget={miniTabId === tab.id}
            reloadNonce={reloadKeys[tab.id] ?? 0}
            onUrlChange={onTabUrlChange ? (url) => onTabUrlChange(tab.id, url) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
