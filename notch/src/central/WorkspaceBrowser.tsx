import type { WorkspaceTab } from './workspace'
import { WorkspaceView } from './WorkspaceView'

type Props = {
  tabs: WorkspaceTab[]
  activeId: string
}

/** Keeps one webview mounted per tab so switching tabs does not reload Google Docs / Meet. */
export function WorkspaceBrowser({ tabs, activeId }: Props) {
  return (
    <div className="x-workspace-browser">
      {tabs.map((tab) => (
        <WorkspaceView key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
    </div>
  )
}
