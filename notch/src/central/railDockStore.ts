import { useCallback, useEffect, useState } from 'react'
import {
  loadRailWidgets,
  resetRailWidgets,
  saveRailWidgets,
  type RailWidgetConfig,
  type RailWidgetId
} from './railWidgetsStore'

export type RailDockPresetId = 'captains_deck' | 'build_watch' | 'meetings_focus' | 'minimal'

export type RailDockConfig = {
  width: number
  compactTabs: boolean
  rememberLastTab: boolean
  lastTab?: RailWidgetId
  defaultTabWorkspace?: RailWidgetId
  defaultTabFeed?: RailWidgetId
  activePreset?: RailDockPresetId | null
}

export const RAIL_WIDTH_MIN = 260
export const RAIL_WIDTH_MAX = 560
export const RAIL_WIDTH_DEFAULT = 320

const STORAGE_KEY = 'stream.central.railDock'
const UPDATE_EVENT = 'notch:rail-dock-updated'

const DEFAULT_DOCK: RailDockConfig = {
  width: RAIL_WIDTH_DEFAULT,
  compactTabs: false,
  rememberLastTab: true,
  defaultTabWorkspace: 'agent',
  defaultTabFeed: 'context',
  activePreset: null
}

export const RAIL_DOCK_PRESETS: Record<
  RailDockPresetId,
  {
    label: string
    description: string
    width: number
    compactTabs?: boolean
    widgetOrder: RailWidgetId[]
    disabled?: RailWidgetId[]
  }
> = {
  captains_deck: {
    label: "Captain's deck",
    description: 'Agents, calendar, and chat while you browse.',
    width: 380,
    widgetOrder: ['agent', 'calendar', 'chat', 'feed', 'context', 'news'],
    disabled: ['news']
  },
  build_watch: {
    label: 'Build watch',
    description: 'Stream + agents for watching builds execute.',
    width: 360,
    widgetOrder: ['feed', 'agent', 'context', 'calendar', 'chat', 'news'],
    disabled: ['news']
  },
  meetings_focus: {
    label: 'Meetings focus',
    description: 'Calendar and chat first — join without losing context.',
    width: 340,
    widgetOrder: ['calendar', 'chat', 'agent', 'feed', 'context', 'news'],
    disabled: ['news']
  },
  minimal: {
    label: 'Minimal',
    description: 'Just agent inbox and calendar.',
    width: 280,
    compactTabs: true,
    widgetOrder: ['agent', 'calendar', 'chat', 'feed', 'context', 'news'],
    disabled: ['feed', 'context', 'chat', 'news']
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function clampWidth(width: number): number {
  return Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, Math.round(width)))
}

function normalizeDock(raw: Partial<RailDockConfig>): RailDockConfig {
  return {
    ...DEFAULT_DOCK,
    ...raw,
    width: clampWidth(raw.width ?? DEFAULT_DOCK.width)
  }
}

function dispatchUpdate(): void {
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

export function loadRailDock(): RailDockConfig {
  return normalizeDock(readJson(STORAGE_KEY, DEFAULT_DOCK))
}

export function saveRailDock(patch: Partial<RailDockConfig>): RailDockConfig {
  const next = normalizeDock({ ...loadRailDock(), ...patch })
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  dispatchUpdate()
  return next
}

export function setRailWidth(width: number): RailDockConfig {
  return saveRailDock({ width: clampWidth(width), activePreset: null })
}

export function setRailLastTab(tab: RailWidgetId): void {
  const dock = loadRailDock()
  if (!dock.rememberLastTab) return
  saveRailDock({ lastTab: tab })
}

export function applyRailDockPreset(presetId: RailDockPresetId): RailDockConfig {
  const preset = RAIL_DOCK_PRESETS[presetId]
  const disabled = new Set(preset.disabled ?? [])
  const widgets: RailWidgetConfig[] = preset.widgetOrder.map((id, order) => ({
    id,
    enabled: !disabled.has(id),
    order,
    ...(id === 'context' ? { pinOnFeed: false } : {})
  }))
  saveRailWidgets(widgets)
  return saveRailDock({
    width: preset.width,
    compactTabs: preset.compactTabs ?? false,
    activePreset: presetId
  })
}

export function resetRailDock(): RailDockConfig {
  localStorage.removeItem(STORAGE_KEY)
  resetRailWidgets()
  dispatchUpdate()
  return DEFAULT_DOCK
}

export function resolveRailDefaultTab(input: {
  workspaceMode: boolean
  visibleIds: Set<RailWidgetId>
  fallback: RailWidgetId
}): RailWidgetId {
  const dock = loadRailDock()
  if (dock.rememberLastTab && dock.lastTab && input.visibleIds.has(dock.lastTab)) {
    return dock.lastTab
  }
  const preferred = input.workspaceMode ? dock.defaultTabWorkspace : dock.defaultTabFeed
  if (preferred && input.visibleIds.has(preferred)) return preferred
  return input.fallback
}

export function useRailDock(): RailDockConfig {
  const [dock, setDock] = useState<RailDockConfig>(() => loadRailDock())

  useEffect(() => {
    const refresh = () => setDock(loadRailDock())
    window.addEventListener(UPDATE_EVENT, refresh)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(UPDATE_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return dock
}

export function useRailDockActions() {
  const save = useCallback((patch: Partial<RailDockConfig>) => saveRailDock(patch), [])
  const setWidth = useCallback((width: number) => setRailWidth(width), [])
  const applyPreset = useCallback((id: RailDockPresetId) => applyRailDockPreset(id), [])
  const reset = useCallback(() => resetRailDock(), [])
  return { save, setWidth, applyPreset, reset }
}

export function applyRailDockCssVars(dock: RailDockConfig): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--x-rail-w', `${dock.width}px`)
}
