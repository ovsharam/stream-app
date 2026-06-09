import {
  RAIL_DOCK_PRESETS,
  RAIL_WIDTH_MAX,
  RAIL_WIDTH_MIN,
  useRailDock,
  useRailDockActions,
  type RailDockPresetId
} from './railDockStore'
import { RAIL_WIDGET_DEFS, useRailWidgets, type RailWidgetId } from './railWidgetsStore'
import { RailWidgetsConfigList } from './RailWidgetsConfig'

function DefaultTabPicker({
  label,
  value,
  onChange
}: {
  label: string
  value?: RailWidgetId
  onChange: (id: RailWidgetId) => void
}) {
  return (
    <label className="x-dock-field">
      <span className="x-dock-field-label">{label}</span>
      <select
        className="x-dock-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as RailWidgetId)}
      >
        {RAIL_WIDGET_DEFS.map((def) => (
          <option key={def.id} value={def.id}>
            {def.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function RailDockSettings({ compact }: { compact?: boolean }) {
  const dock = useRailDock()
  const widgets = useRailWidgets()
  const { save, setWidth, applyPreset, reset } = useRailDockActions()
  const enabledCount = widgets.filter((w) => w.enabled).length

  return (
    <div className={`x-dock-settings${compact ? ' x-dock-settings-compact' : ''}`}>
      <section className="x-dock-section">
        <h3 className="x-dock-section-title">Presets</h3>
        <p className="x-dock-section-desc">
          One-click layouts for how you work — ESPN in the middle, agents and meetings on the rail.
        </p>
        <div className="x-dock-presets">
          {(Object.entries(RAIL_DOCK_PRESETS) as [RailDockPresetId, (typeof RAIL_DOCK_PRESETS)[RailDockPresetId]][]).map(
            ([id, preset]) => (
              <button
                key={id}
                type="button"
                className={`x-dock-preset${dock.activePreset === id ? ' x-dock-preset-active' : ''}`}
                onClick={() => applyPreset(id)}
              >
                <span className="x-dock-preset-label">{preset.label}</span>
                <span className="x-dock-preset-desc">{preset.description}</span>
              </button>
            )
          )}
        </div>
      </section>

      <section className="x-dock-section">
        <h3 className="x-dock-section-title">Layout</h3>
        <div className="x-dock-width-row">
          <label className="x-dock-field x-dock-field-grow">
            <span className="x-dock-field-label">Panel width — {dock.width}px</span>
            <input
              type="range"
              className="x-dock-range"
              min={RAIL_WIDTH_MIN}
              max={RAIL_WIDTH_MAX}
              step={10}
              value={dock.width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <div className="x-dock-width-bounds">
            <span>{RAIL_WIDTH_MIN}</span>
            <span>{RAIL_WIDTH_MAX}</span>
          </div>
        </div>
        <p className="x-dock-hint">Drag the left edge of the side panel to resize anytime.</p>
        <label className="x-dock-toggle-row">
          <span className="x-dock-toggle-label">Compact tab labels</span>
          <input
            type="checkbox"
            className="x-dock-checkbox"
            checked={dock.compactTabs}
            onChange={(e) => save({ compactTabs: e.target.checked, activePreset: null })}
          />
        </label>
      </section>

      <section className="x-dock-section">
        <h3 className="x-dock-section-title">Behavior</h3>
        <label className="x-dock-toggle-row">
          <span className="x-dock-toggle-label">Remember last open tab</span>
          <input
            type="checkbox"
            className="x-dock-checkbox"
            checked={dock.rememberLastTab}
            onChange={(e) => save({ rememberLastTab: e.target.checked })}
          />
        </label>
        <div className="x-dock-default-tabs">
          <DefaultTabPicker
            label="Default tab while browsing (ESPN, docs, etc.)"
            value={dock.defaultTabWorkspace}
            onChange={(id) => save({ defaultTabWorkspace: id, activePreset: null })}
          />
          <DefaultTabPicker
            label="Default tab on Feed"
            value={dock.defaultTabFeed}
            onChange={(id) => save({ defaultTabFeed: id, activePreset: null })}
          />
        </div>
      </section>

      <section className="x-dock-section">
        <div className="x-dock-section-head">
          <h3 className="x-dock-section-title">Tabs & tools</h3>
          <span className="x-dock-section-meta">{enabledCount} enabled</span>
        </div>
        <RailWidgetsConfigList />
      </section>

      <div className="x-dock-foot">
        <button type="button" className="x-dock-reset" onClick={reset}>
          Reset dock to defaults
        </button>
      </div>
    </div>
  )
}
