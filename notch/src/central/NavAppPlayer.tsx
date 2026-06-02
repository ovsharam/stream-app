import { useRef } from 'react'
import { openExternal } from '../lib/api'
import type { NavApp } from './navAppsStore'
import { isNavAppDesktop } from './navAppsStore'
import { useNavAppBrowserView } from './useNavAppBrowserView'

export type NavAppPlayerMode = 'full' | 'mini' | 'off'

type Props = {
  app: NavApp
  mode: NavAppPlayerMode
  hasRail?: boolean
  onMinimize: () => void
  onExpand: () => void
  onClose: () => void
}

export function NavAppPlayer({ app, mode, hasRail, onMinimize, onExpand, onClose }: Props) {
  const desktop = isNavAppDesktop()
  const surfaceRef = useRef<HTMLDivElement>(null)

  useNavAppBrowserView(surfaceRef, app, mode)

  if (mode === 'off') return null

  return (
    <div
      className={`x-nav-app-player x-nav-app-player--${mode}${hasRail ? ' x-nav-app-player-rail' : ''}`}
      role={mode === 'mini' ? 'dialog' : undefined}
      aria-label={`${app.label} player`}
    >
      <header className="x-nav-app-player-bar">
        <span className="x-nav-app-player-title">{app.label}</span>
        <div className="x-nav-app-player-actions">
          {mode === 'full' && app.miniPlayer ? (
            <button type="button" className="x-nav-app-player-btn" onClick={onMinimize} title="Mini player">
              Mini
            </button>
          ) : null}
          {mode === 'mini' ? (
            <button type="button" className="x-nav-app-player-btn" onClick={onExpand} title="Expand">
              Expand
            </button>
          ) : null}
          <button
            type="button"
            className="x-nav-app-player-btn x-nav-app-player-btn-external"
            onClick={() => openExternal(app.url)}
            title="Open in browser"
          >
            ↗
          </button>
          <button type="button" className="x-nav-app-player-btn x-nav-app-player-btn-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </header>
      <div className="x-nav-app-player-body">
        {desktop ? (
          <div ref={surfaceRef} className="x-nav-app-player-surface" aria-hidden="true" />
        ) : (
          <div className="x-nav-app-player-fallback">
            <p>In-app apps run in the Notch desktop app (Electron).</p>
            <button type="button" className="x-nav-app-player-fallback-open" onClick={() => openExternal(app.url)}>
              Open {app.label} in browser
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
