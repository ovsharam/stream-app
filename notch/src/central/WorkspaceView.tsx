import type { WorkspaceTab } from './workspace'

type Props = {
  tab: WorkspaceTab
}

export function WorkspaceView({ tab }: Props) {
  return (
    <section className="x-workspace">
      <header className="x-workspace-head">
        <div>
          <p className="x-workspace-source">{tab.title}</p>
          <p className="x-workspace-summary">{tab.summary}</p>
        </div>
        <p className="x-workspace-url">{tab.url}</p>
      </header>
      <webview className="x-workspace-webview" src={tab.url} partition="persist:stream-central" />
    </section>
  )
}
