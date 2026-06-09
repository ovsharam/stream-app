import {
  RAIL_WIDGET_DEFS,
  isAutoHiddenOnFeed,
  useRailWidgetActions,
  useRailWidgets,
  type RailWidgetId
} from './railWidgetsStore'
import { RailDockSettings } from './RailDockSettings'

function WidgetRow({
  label,
  enabled,
  pinOnFeed,
  autoHideOnFeed,
  canMoveUp,
  canMoveDown,
  onToggle,
  onPin,
  onMove
}: {
  label: string
  enabled: boolean
  pinOnFeed?: boolean
  autoHideOnFeed?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onToggle: (enabled: boolean) => void
  onPin: (pin: boolean) => void
  onMove: (direction: 'up' | 'down') => void
}) {
  return (
    <li className="x-rail-widget-row">
      <div className="x-rail-widget-row-top">
        <div className="x-rail-widget-reorder" aria-label={`Reorder ${label}`}>
          <button
            type="button"
            className="x-rail-widget-reorder-btn"
            disabled={!canMoveUp}
            aria-label={`Move ${label} up`}
            onClick={() => onMove('up')}
          >
            ↑
          </button>
          <button
            type="button"
            className="x-rail-widget-reorder-btn"
            disabled={!canMoveDown}
            aria-label={`Move ${label} down`}
            onClick={() => onMove('down')}
          >
            ↓
          </button>
        </div>
        <div className="x-rail-widget-row-main">
          <span className="x-rail-widget-row-label">{label}</span>
          {autoHideOnFeed && enabled ? (
            <span className="x-rail-widget-row-hint">Auto-hidden on Feed</span>
          ) : null}
        </div>
        <label className="x-rail-widget-toggle" aria-label={`Show ${label}`}>
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
          <span className="x-rail-widget-switch" aria-hidden />
        </label>
      </div>
      {autoHideOnFeed && enabled ? (
        <div className="x-rail-widget-row-sub">
          <span className="x-rail-widget-sub-label">Show on Feed</span>
          <label className="x-rail-widget-toggle x-rail-widget-toggle-sm" aria-label="Show Context on Feed">
            <input type="checkbox" checked={Boolean(pinOnFeed)} onChange={(e) => onPin(e.target.checked)} />
            <span className="x-rail-widget-switch" aria-hidden />
          </label>
        </div>
      ) : null}
    </li>
  )
}

export function RailWidgetsConfigList() {
  const widgets = useRailWidgets()
  const { toggle, pin, move, reset } = useRailWidgetActions()
  const sorted = [...widgets].sort((a, b) => a.order - b.order)

  return (
    <div className="x-rail-widget-config">
      <div className="x-rail-widget-group">
        <ul className="x-rail-widget-list">
          {sorted.map((widget, index) => {
            const def = RAIL_WIDGET_DEFS.find((d) => d.id === widget.id)
            return (
              <WidgetRow
                key={widget.id}
                label={def?.label ?? widget.id}
                enabled={widget.enabled}
                pinOnFeed={widget.pinOnFeed}
                autoHideOnFeed={def?.autoHideOnFeed}
                canMoveUp={index > 0}
                canMoveDown={index < sorted.length - 1}
                onToggle={(enabled) => toggle(widget.id as RailWidgetId, enabled)}
                onPin={(pinOnFeed) => pin(widget.id as RailWidgetId, pinOnFeed)}
                onMove={(direction) => move(widget.id as RailWidgetId, direction)}
              />
            )
          })}
        </ul>
      </div>
      <div className="x-rail-widget-config-foot">
        <button type="button" className="x-rail-widget-reset" onClick={reset}>
          Reset to defaults
        </button>
        {sorted.filter((w) => w.enabled && isAutoHiddenOnFeed(w)).length > 0 ? (
          <p className="x-rail-widget-config-note">Context hides on Feed unless “Show on Feed” is on.</p>
        ) : null}
      </div>
    </div>
  )
}

export function RailWidgetsConfigSheet({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="x-rail-widget-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="x-rail-widget-sheet x-rail-dock-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="x-rail-widget-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="x-rail-widget-sheet-head">
          <div>
            <h2 id="x-rail-widget-sheet-title">Dock station</h2>
            <p className="x-rail-dock-sheet-sub">Your command rail — tabs, width, and layout.</p>
          </div>
          <button type="button" className="x-rail-widget-sheet-done" onClick={onClose}>
            Done
          </button>
        </header>
        <RailDockSettings compact />
      </div>
    </div>
  )
}
