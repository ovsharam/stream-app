import { openBrowserLink } from '../lib/api'
import type { WorkspaceTab } from './workspace'
import { EmbeddedWebview } from './EmbeddedWebview'

type Props = {
  tab: WorkspaceTab
  active: boolean
}

export function WorkspaceView({ tab, active }: Props) {
  return (
    <section className={`x-workspace${active ? ' x-workspace-active' : ''}`} aria-hidden={!active}>
      <div className="x-workspace-toolbar">
        <span className="x-workspace-toolbar-url" title={tab.url}>
          {tab.url}
        </span>
        <button
          type="button"
          className="x-workspace-external"
          onClick={() => openBrowserLink(tab.url, { forceExternal: true, title: tab.title, source: tab.source })}
          title="Open in system browser"
        >
          ↗
        </button>
      </div>
      <EmbeddedWebview className="x-workspace-webview" src={tab.url} partition="persist:stream-central" />
    </section>
  )
}
