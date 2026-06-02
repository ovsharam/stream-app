import { useCallback, useEffect, useState } from 'react'

export type NavApp = {
  id: string
  label: string
  url: string
  /** Shrink to mini player when navigating to Home / Feed */
  miniPlayer?: boolean
}

export type NavAppCatalogEntry = {
  id: string
  label: string
  url: string
  miniPlayer?: boolean
  description: string
  brandClass: string
}

const STORAGE_KEY = 'notch.navApps'

/** Apps available to pin from the Apps page — not pinned by default. */
export const NAV_APP_CATALOG: NavAppCatalogEntry[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com',
    miniPlayer: true,
    description: 'Watch and listen in Notch — keeps playing in a mini player when you switch to Feed.',
    brandClass: 'x-int-card-youtube'
  },
  {
    id: 'cursor',
    label: 'Cursor',
    url: 'https://cursor.com/agents',
    miniPlayer: false,
    description: 'Open Cursor agent chat in Notch alongside your feed.',
    brandClass: 'x-int-card-cursor'
  }
]

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function slugId(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `app-${base || 'link'}-${Date.now().toString(36).slice(-4)}`
}

export function loadNavApps(): NavApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NavApp[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function saveNavApps(apps: NavApp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
}

export function getNavApp(id: string, apps = loadNavApps()): NavApp | undefined {
  return apps.find((a) => a.id === id)
}

export function isNavAppPinned(id: string, apps = loadNavApps()): boolean {
  return apps.some((a) => a.id === id)
}

export function pinCatalogApp(catalogId: string): NavApp | null {
  const entry = NAV_APP_CATALOG.find((c) => c.id === catalogId)
  if (!entry) return null
  const apps = loadNavApps()
  const existing = apps.find((a) => a.id === entry.id)
  if (existing) return existing
  const app: NavApp = {
    id: entry.id,
    label: entry.label,
    url: entry.url,
    miniPlayer: entry.miniPlayer ?? false
  }
  saveNavApps([...apps, app])
  return app
}

export function addNavApp(input: { label: string; url: string; miniPlayer?: boolean }): NavApp {
  const apps = loadNavApps()
  const url = normalizeUrl(input.url)
  const app: NavApp = {
    id: slugId(input.label),
    label: input.label.trim() || 'App',
    url,
    miniPlayer: input.miniPlayer ?? true
  }
  const next = [...apps, app]
  saveNavApps(next)
  return app
}

export function removeNavApp(id: string): NavApp[] {
  const next = loadNavApps().filter((a) => a.id !== id)
  saveNavApps(next)
  return next
}

export function useNavApps() {
  const [apps, setApps] = useState<NavApp[]>(() => loadNavApps())

  useEffect(() => {
    saveNavApps(apps)
  }, [apps])

  const refresh = useCallback(() => setApps(loadNavApps()), [])

  const add = useCallback((input: { label: string; url: string; miniPlayer?: boolean }) => {
    const app = addNavApp(input)
    setApps(loadNavApps())
    return app
  }, [])

  const pinCatalog = useCallback((catalogId: string) => {
    const app = pinCatalogApp(catalogId)
    setApps(loadNavApps())
    return app
  }, [])

  const remove = useCallback((id: string) => {
    setApps(removeNavApp(id))
  }, [])

  return { apps, add, pinCatalog, remove, refresh }
}

export function isNavAppDesktop(): boolean {
  return typeof window !== 'undefined' &&
    (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
}
