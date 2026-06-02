import { openExternal } from '../lib/api'
import type { WorkspaceTab } from './workspace'

type Props = {
  tab: WorkspaceTab
}

export function WorkspaceView({ tab }: Props) {
  return (
    <section className="x-workspace">
      <header className="x-workspace-head">
        <div className="x-workspace-head-main">
          <p className="x-workspace-source">{tab.title}</p>
          {tab.summary && tab.summary !== tab.url ? (
            <p className="x-workspace-summary">{tab.summary}</p>
          ) : null}
        </div>
        <div className="x-workspace-head-actions">
          <button
            type="button"
            className="x-workspace-external"
            onClick={() => openExternal(tab.url)}
          >
            Open in browser
          </button>
        </div>
      </header>
      <webview className="x-workspace-webview" src={tab.url} partition="persist:stream-central" allowpopups />
    </section>
  )
}
