import { useEffect, useState } from 'react'
import type { WorkspaceTab } from './workspace'

type Props = {
  tab: WorkspaceTab
  onNavigate: (url: string) => void
  onReload: () => void
  onExternal: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  onBack?: () => void
  onForward?: () => void
  railCollapsed?: boolean
  onToggleRail?: () => void
  /** Pinned app or home browser — label rail toggle as Stream panel. */
  workspaceMode?: boolean
}

export function BrowserChrome({
  tab,
  onNavigate,
  onReload,
  onExternal,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  railCollapsed,
  onToggleRail,
  workspaceMode = false
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
      <button
        type="button"
        className="x-browser-chrome-btn"
        title="Back"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={onBack}
      >
        ←
      </button>
      <button
        type="button"
        className="x-browser-chrome-btn"
        title="Forward"
        aria-label="Forward"
        disabled={!canGoForward}
        onClick={onForward}
      >
        →
      </button>
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
            className={`x-browser-chrome-btn x-browser-chrome-rail${workspaceMode ? ' x-browser-chrome-rail-labeled' : ''}${railCollapsed ? ' active' : ''}`}
            title={railCollapsed ? 'Show Stream panel' : 'Hide Stream panel'}
            aria-label={railCollapsed ? 'Show Stream panel' : 'Hide Stream panel'}
            onClick={onToggleRail}
          >
            {workspaceMode ? (railCollapsed ? '◧ Stream' : '◨ Stream') : railCollapsed ? '◧' : '◨'}
          </button>
        ) : null}
      </div>
    </header>
  )
}
