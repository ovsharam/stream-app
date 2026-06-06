import { useState } from 'react'
import { BROWSER_QUICK_LINKS } from './browserUrl'
import type { WorkspaceTab } from './workspace'

type Props = {
  homeLabel: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
  collapsed?: boolean
  onSelectHome: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: (url: string) => void
  onToggleCollapsed: () => void
}

function tabIcon(source: WorkspaceTab['source']): string {
  switch (source) {
    case 'gmail':
      return '✉'
    case 'gdocs':
      return 'G'
    case 'youtube':
      return '▶'
    case 'linkedin':
      return 'in'
    case 'monday':
      return '◉'
    case 'calcom':
      return 'C'
    case 'slack':
      return 'S'
    case 'github':
      return '⎇'
    case 'meet':
      return '▶'
    default:
      return '◆'
  }
}

export function WorkspaceSidebar({
  homeLabel,
  tabs,
  activeTabId,
  collapsed,
  onSelectHome,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleCollapsed
}: Props) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const submitNew = () => {
    const raw = draft.trim()
    if (!raw) return
    onNewTab(raw)
    setDraft('')
    setAdding(false)
  }

  return (
    <aside className={`x-browser-sidebar${collapsed ? ' x-browser-sidebar-collapsed' : ''}`}>
      <div className="x-browser-sidebar-head">
        {!collapsed ? (
          <span className="x-browser-sidebar-title">Browser</span>
        ) : null}
        <button
          type="button"
          className="x-browser-sidebar-icon-btn x-browser-sidebar-icon-btn-end"
          title={collapsed ? 'Expand tabs' : 'Collapse tabs'}
          aria-label={collapsed ? 'Expand tabs' : 'Collapse tabs'}
          onClick={onToggleCollapsed}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <button
        type="button"
        className={`x-browser-sidebar-item x-browser-sidebar-home${!activeTabId ? ' active' : ''}`}
        title={homeLabel}
        onClick={onSelectHome}
      >
        <span className="x-browser-sidebar-item-icon" aria-hidden>
          ⌂
        </span>
        {!collapsed ? <span className="x-browser-sidebar-item-label">{homeLabel}</span> : null}
      </button>

      <div className="x-browser-sidebar-tabs" role="tablist" aria-label="Open tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={activeTabId === t.id}
            className={`x-browser-sidebar-item${activeTabId === t.id ? ' active' : ''}`}
          >
            <button type="button" className="x-browser-sidebar-item-main" onClick={() => onSelectTab(t.id)} title={t.title}>
              <span className={`x-browser-sidebar-item-icon x-browser-sidebar-item-icon-${t.source}`} aria-hidden>
                {tabIcon(t.source)}
              </span>
              {!collapsed ? <span className="x-browser-sidebar-item-label">{t.title}</span> : null}
            </button>
            {!collapsed ? (
              <button
                type="button"
                className="x-browser-sidebar-close"
                aria-label={`Close ${t.title}`}
                onClick={() => onCloseTab(t.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {!collapsed ? (
        <div className="x-browser-sidebar-foot">
          {adding ? (
            <form
              className="x-browser-sidebar-new-form"
              onSubmit={(e) => {
                e.preventDefault()
                submitNew()
              }}
            >
              <input
                className="x-browser-sidebar-new-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="URL or search…"
                autoFocus
                spellCheck={false}
              />
              <div className="x-browser-sidebar-new-actions">
                <button type="button" className="x-browser-sidebar-link-btn" onClick={() => setAdding(false)}>
                  Cancel
                </button>
                <button type="submit" className="x-browser-sidebar-primary-btn">
                  Open
                </button>
              </div>
            </form>
          ) : (
            <>
              <button type="button" className="x-browser-sidebar-new-btn" onClick={() => setAdding(true)}>
                + New tab
              </button>
              <div className="x-browser-sidebar-quick">
                {BROWSER_QUICK_LINKS.map((link) => (
                  <button
                    key={link.url}
                    type="button"
                    className="x-browser-sidebar-quick-btn"
                    onClick={() => onNewTab(link.url)}
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="x-browser-sidebar-icon-btn x-browser-sidebar-new-compact"
          title="New tab"
          aria-label="New tab"
          onClick={() => onNewTab('https://www.google.com')}
        >
          +
        </button>
      )}
    </aside>
  )
}
