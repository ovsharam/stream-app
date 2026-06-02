import { useCallback, useEffect, useState } from 'react'

export type NavApp = {
  id: string
  label: string
  url: string
  /** Shrink to mini player when navigating to Home / Feed */
  miniPlayer?: boolean
  builtin?: boolean
}

const STORAGE_KEY = 'notch.navApps'

export const DEFAULT_NAV_APPS: NavApp[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com',
    miniPlayer: true,
    builtin: true
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

function mergeApps(stored: NavApp[]): NavApp[] {
  const builtins = DEFAULT_NAV_APPS.filter((d) => d.builtin)
  const custom = stored.filter((a) => !a.builtin && !builtins.some((b) => b.id === a.id))
  return [...builtins, ...custom]
}

export function loadNavApps(): NavApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_NAV_APPS]
    const parsed = JSON.parse(raw) as NavApp[]
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_APPS]
    return mergeApps(parsed)
  } catch {
    return [...DEFAULT_NAV_APPS]
  }
}

export function saveNavApps(apps: NavApp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
}

export function getNavApp(id: string, apps = loadNavApps()): NavApp | undefined {
  return apps.find((a) => a.id === id)
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
  const app = getNavApp(id)
  if (app?.builtin) return loadNavApps()
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

  const remove = useCallback((id: string) => {
    setApps(removeNavApp(id))
  }, [])

  return { apps, add, remove, refresh }
}

export function isNavAppDesktop(): boolean {
  return typeof window !== 'undefined' &&
    (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
}
