import { useEffect, useState } from 'react'
import type { WorkspaceTab } from './workspace'

type Props = {
  tab: WorkspaceTab
  onNavigate: (url: string) => void
  onReload: () => void
  onExternal: () => void
  railCollapsed?: boolean
  onToggleRail?: () => void
}

export function BrowserChrome({
  tab,
  onNavigate,
  onReload,
  onExternal,
  railCollapsed,
  onToggleRail
}: Props) {
  const [draft, setDraft] = useState(tab.url)

  useEffect(() => {
    setDraft(tab.url)
  }, [tab.id, tab.url])

  const submit = () => {
    const next = draft.trim()
    if (!next || next === tab.url) return
    onNavigate(next)
  }

  return (
    <header className="x-browser-chrome">
      <button type="button" className="x-browser-chrome-btn" title="Reload" aria-label="Reload" onClick={onReload}>
        ↻
      </button>
      <form
        className="x-browser-chrome-url-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          className="x-browser-chrome-url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label="Address"
        />
      </form>
      <div className="x-browser-chrome-actions">
        <button type="button" className="x-browser-chrome-btn" title="Open in browser" aria-label="Open in browser" onClick={onExternal}>
          ↗
        </button>
        {onToggleRail ? (
          <button
            type="button"
            className={`x-browser-chrome-btn${railCollapsed ? ' active' : ''}`}
            title={railCollapsed ? 'Show panel' : 'Hide panel'}
            aria-label={railCollapsed ? 'Show panel' : 'Hide panel'}
            onClick={onToggleRail}
          >
            {railCollapsed ? '◧' : '◨'}
          </button>
        ) : null}
      </div>
    </header>
  )
}
