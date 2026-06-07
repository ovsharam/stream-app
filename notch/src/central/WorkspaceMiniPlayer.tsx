import type { ReactNode } from 'react'
import { openBrowserLink } from '../lib/api'

type Props = {
  label: string
  url: string
  hasRail?: boolean
  onExpand: () => void
  onClose: () => void
  children?: ReactNode
}

export function WorkspaceMiniPlayer({ label, url, hasRail, onExpand, onClose, children }: Props) {
  return (
    <div
      className={`x-workspace-mini-player x-nav-app-player x-nav-app-player--mini${hasRail ? ' x-nav-app-player-rail' : ''}`}
      role="dialog"
      aria-label={`${label} mini player`}
    >
      <header className="x-nav-app-player-bar">
        <span className="x-nav-app-player-title">{label}</span>
        <div className="x-nav-app-player-actions">
          <button type="button" className="x-nav-app-player-btn" onClick={onExpand} title="Expand">
            Expand
          </button>
          <button
            type="button"
            className="x-nav-app-player-btn x-nav-app-player-btn-external"
            onClick={() => openBrowserLink(url, { forceExternal: true, title: label })}
            title="Open in browser"
          >
            ↗
          </button>
          <button
            type="button"
            className="x-nav-app-player-btn x-nav-app-player-btn-close"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
      </header>
      <div className="x-nav-app-player-body x-workspace-mini-player-body">{children ?? null}</div>
    </div>
  )
}
