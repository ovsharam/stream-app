import { useCallback, useEffect, useState } from 'react'

export type RailWidgetId = 'feed' | 'context' | 'calendar' | 'chat' | 'news' | 'agent'

export type RailWidgetConfig = {
  id: RailWidgetId
  enabled: boolean
  order: number
  /** Show on Feed even when auto-hidden by smart default (Context). */
  pinOnFeed?: boolean
}

export type RailContext = {
  page?: string
  area?: 'work' | 'feed'
  tab?: string
  /** Pinned app or home browser — show workspace stream panel. */
  workspaceMode?: boolean
}

export const RAIL_WIDGET_DEFS: {
  id: RailWidgetId
  label: string
  autoHideOnFeed?: boolean
  workspaceOnly?: boolean
}[] = [
  { id: 'feed', label: 'Stream', workspaceOnly: true },
  { id: 'context', label: 'Context', autoHideOnFeed: true },
  { id: 'calendar', label: 'Calendar' },
  { id: 'chat', label: 'Chat' },
  { id: 'news', label: 'News' },
  { id: 'agent', label: 'Agent' }
]

const STORAGE_KEY = 'stream.central.railWidgets'
const UPDATE_EVENT = 'notch:rail-widgets-updated'

const DEFAULT_WIDGETS: RailWidgetConfig[] = RAIL_WIDGET_DEFS.map((def, order) => ({
  id: def.id,
  enabled: true,
  order,
  ...(def.autoHideOnFeed ? { pinOnFeed: false } : {})
}))

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeConfig(raw: RailWidgetConfig[]): RailWidgetConfig[] {
  const byId = new Map(raw.map((w) => [w.id, w]))
  return RAIL_WIDGET_DEFS.map((def, index) => {
    const saved = byId.get(def.id)
    const base: RailWidgetConfig = {
      id: def.id,
      enabled: saved?.enabled ?? true,
      order: saved?.order ?? index,
      ...(def.autoHideOnFeed ? { pinOnFeed: saved?.pinOnFeed ?? false } : {})
    }
    return base
  }).sort((a, b) => a.order - b.order)
}

function dispatchUpdate(): void {
  window.dispatchEvent(new Event(UPDATE_EVENT))
}

export function loadRailWidgets(): RailWidgetConfig[] {
  const raw = readJson<RailWidgetConfig[]>(STORAGE_KEY, DEFAULT_WIDGETS)
  return normalizeConfig(raw)
}

export function saveRailWidgets(widgets: RailWidgetConfig[]): void {
  const normalized = normalizeConfig(widgets)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  dispatchUpdate()
}

export function resetRailWidgets(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WIDGETS))
  dispatchUpdate()
}

export function widgetLabel(id: RailWidgetId): string {
  return RAIL_WIDGET_DEFS.find((d) => d.id === id)?.label ?? id
}

export function isAutoHiddenOnFeed(widget: RailWidgetConfig): boolean {
  const def = RAIL_WIDGET_DEFS.find((d) => d.id === widget.id)
  return Boolean(def?.autoHideOnFeed && !widget.pinOnFeed)
}

export function getVisibleWidgets(
  widgets: RailWidgetConfig[],
  context: RailContext
): RailWidgetConfig[] {
  const onFeed = context.area === 'feed'
  return widgets
    .filter((w) => w.enabled)
    .filter((w) => {
      const def = RAIL_WIDGET_DEFS.find((d) => d.id === w.id)
      if (def?.workspaceOnly && !context.workspaceMode) return false
      return true
    })
    .filter((w) => !onFeed || !isAutoHiddenOnFeed(w))
    .sort((a, b) => a.order - b.order)
}

export function toggleWidget(id: RailWidgetId, enabled?: boolean): RailWidgetConfig[] {
  const widgets = loadRailWidgets()
  const next = widgets.map((w) =>
    w.id === id ? { ...w, enabled: enabled ?? !w.enabled } : w
  )
  saveRailWidgets(next)
  return next
}

export function setPinOnFeed(id: RailWidgetId, pinOnFeed: boolean): RailWidgetConfig[] {
  const widgets = loadRailWidgets()
  const next = widgets.map((w) => (w.id === id ? { ...w, pinOnFeed } : w))
  saveRailWidgets(next)
  return next
}

export function reorderWidgets(orderedIds: RailWidgetId[]): RailWidgetConfig[] {
  const widgets = loadRailWidgets()
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const next = orderedIds
    .map((id, order) => {
      const w = byId.get(id)
      return w ? { ...w, order } : null
    })
    .filter((w): w is RailWidgetConfig => w != null)
  for (const w of widgets) {
    if (!orderedIds.includes(w.id)) next.push(w)
  }
  saveRailWidgets(next)
  return next
}

export function moveWidget(id: RailWidgetId, direction: 'up' | 'down'): RailWidgetConfig[] {
  const widgets = loadRailWidgets()
  const sorted = [...widgets].sort((a, b) => a.order - b.order)
  const index = sorted.findIndex((w) => w.id === id)
  if (index < 0) return widgets
  const swapIndex = direction === 'up' ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= sorted.length) return widgets
  const ids = sorted.map((w) => w.id)
  ;[ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]]
  return reorderWidgets(ids)
}

export function useRailWidgets(): RailWidgetConfig[] {
  const [widgets, setWidgets] = useState<RailWidgetConfig[]>(() => loadRailWidgets())

  useEffect(() => {
    const refresh = () => setWidgets(loadRailWidgets())
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

  return widgets
}

export function useRailWidgetActions() {
  const toggle = useCallback((id: RailWidgetId, enabled?: boolean) => {
    toggleWidget(id, enabled)
  }, [])
  const pin = useCallback((id: RailWidgetId, pinOnFeed: boolean) => {
    setPinOnFeed(id, pinOnFeed)
  }, [])
  const move = useCallback((id: RailWidgetId, direction: 'up' | 'down') => {
    moveWidget(id, direction)
  }, [])
  const reset = useCallback(() => {
    resetRailWidgets()
  }, [])
  return { toggle, pin, move, reset }
}
