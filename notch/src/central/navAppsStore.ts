import { useCallback, useEffect, useState } from 'react'

export type NavApp = {
  id: string
  label: string
  url: string
  /** Shrink to mini player when navigating to Home / Feed */
  miniPlayer?: boolean
  /** OAuth-heavy sites — open in system browser instead of BrowserView */
  externalOnly?: boolean
  /** embed = BrowserView player; workspace = in-app tab webview */
  surface?: 'embed' | 'workspace'
}

export type NavAppCatalogEntry = {
  id: string
  label: string
  url: string
  miniPlayer?: boolean
  externalOnly?: boolean
  surface: 'embed' | 'workspace'
  /** Only offered in pin picker when this integration is connected */
  integrationId?: string
  description: string
  brandClass: string
}

const STORAGE_KEY = 'notch.navApps'

/** Apps you can pin from sidebar / Apps — no manual URLs. */
export const PINNABLE_APPS: NavAppCatalogEntry[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    url: 'https://www.youtube.com',
    surface: 'workspace',
    miniPlayer: true,
    description: 'YouTube in an in-app tab.',
    brandClass: 'x-int-card-youtube'
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/feed/',
    surface: 'workspace',
    description: 'LinkedIn feed, messages, and notifications in an in-app tab.',
    brandClass: 'x-int-card-linkedin'
  },
  {
    id: 'gmail',
    label: 'Gmail',
    url: 'https://mail.google.com',
    surface: 'workspace',
    integrationId: 'gmail',
    description: 'Your connected inbox in an in-app tab.',
    brandClass: 'x-int-card-gmail'
  },
  {
    id: 'slack',
    label: 'Slack',
    url: 'https://app.slack.com/client',
    surface: 'workspace',
    integrationId: 'slack',
    description: 'Slack workspace in an in-app tab.',
    brandClass: 'x-int-card-slack'
  },
  {
    id: 'discord',
    label: 'Discord',
    url: 'https://discord.com/channels/@me',
    surface: 'workspace',
    integrationId: 'discord',
    description: 'Discord in an in-app tab.',
    brandClass: 'x-int-card-discord'
  },
  {
    id: 'monday',
    label: 'Monday',
    url: 'https://monday.com',
    surface: 'workspace',
    integrationId: 'monday',
    description: 'Monday boards in an in-app tab.',
    brandClass: 'x-int-card-monday'
  },
  {
    id: 'gdocs',
    label: 'Google Docs',
    url: 'https://docs.google.com/document/u/0/',
    surface: 'workspace',
    integrationId: 'gdocs',
    description: 'Google Docs in an in-app tab.',
    brandClass: 'x-int-card-gdocs'
  },
  {
    id: 'github',
    label: 'GitHub',
    url: 'https://github.com',
    surface: 'workspace',
    integrationId: 'github',
    description: 'GitHub in an in-app tab.',
    brandClass: 'x-int-card-github'
  }
]

/** Embedded desktop apps (BrowserView) — subset shown on Apps page. */
export const NAV_APP_CATALOG: NavAppCatalogEntry[] = PINNABLE_APPS.filter((a) => a.surface === 'embed')

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
    return syncCatalogNavAppUrls(parsed)
  } catch {
    return []
  }
}

/** Drop legacy Cursor browser pins and unknown custom URL pins. */
function syncCatalogNavAppUrls(apps: NavApp[]): NavApp[] {
  const allowed = new Set(PINNABLE_APPS.map((p) => p.id))
  const withoutCursor = apps.filter((a) => a.id !== 'cursor' && allowed.has(a.id))
  let changed = withoutCursor.length !== apps.length
  const next = withoutCursor.map((app) => {
    const entry = PINNABLE_APPS.find((c) => c.id === app.id)
    if (!entry) return app
    const entryMiniPlayer = entry.miniPlayer ?? false
    const appMiniPlayer = app.miniPlayer ?? false
    if (
      app.url === entry.url &&
      app.label === entry.label &&
      app.surface === entry.surface &&
      appMiniPlayer === entryMiniPlayer
    ) {
      return app
    }
    changed = true
    return {
      ...app,
      url: entry.url,
      label: entry.label,
      miniPlayer: entryMiniPlayer,
      surface: entry.surface
    }
  })
  if (changed) saveNavApps(next)
  return next
}

export function saveNavApps(apps: NavApp[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
}

export function getNavApp(id: string, apps = loadNavApps()): NavApp | undefined {
  const app = apps.find((a) => a.id === id)
  if (!app) return undefined
  return mergeNavAppCatalogFlags(app)
}

export function navAppRequiresExternalBrowser(app: NavApp): boolean {
  return mergeNavAppCatalogFlags(app).externalOnly === true
}

function mergeNavAppCatalogFlags(app: NavApp): NavApp {
  const entry = PINNABLE_APPS.find((c) => c.id === app.id)
  if (!entry) return app
  return {
    ...app,
    externalOnly: app.externalOnly ?? entry.externalOnly,
    miniPlayer: app.miniPlayer ?? entry.miniPlayer,
    surface: app.surface ?? entry.surface,
    url: entry.url,
    label: entry.label
  }
}

export function listUnpinnedApps(
  connected: Record<string, boolean>,
  apps = loadNavApps()
): NavAppCatalogEntry[] {
  const pinnedIds = new Set(apps.map((a) => a.id))
  return PINNABLE_APPS.filter((entry) => {
    if (pinnedIds.has(entry.id)) return false
    if (entry.integrationId && !connected[entry.integrationId]) return false
    return true
  })
}

export function pinnableEntryForIntegration(integrationId: string): NavAppCatalogEntry | undefined {
  return PINNABLE_APPS.find((p) => p.integrationId === integrationId)
}

export function pinnableEntryById(id: string): NavAppCatalogEntry | undefined {
  return PINNABLE_APPS.find((p) => p.id === id)
}

export function isNavAppPinned(id: string, apps = loadNavApps()): boolean {
  return apps.some((a) => a.id === id)
}

export function isIntegrationPinned(integrationId: string, apps = loadNavApps()): boolean {
  const entry = pinnableEntryForIntegration(integrationId)
  return entry ? isNavAppPinned(entry.id, apps) : false
}

export function pinApp(catalogId: string): NavApp | null {
  const entry = PINNABLE_APPS.find((c) => c.id === catalogId)
  if (!entry) return null
  const apps = loadNavApps()
  const existing = apps.find((a) => a.id === entry.id)
  if (existing) return mergeNavAppCatalogFlags(existing)
  const app: NavApp = {
    id: entry.id,
    label: entry.label,
    url: entry.url,
    miniPlayer: entry.miniPlayer ?? false,
    externalOnly: entry.externalOnly,
    surface: entry.surface
  }
  saveNavApps([...apps, app])
  return app
}

/** @deprecated use pinApp */
export function pinCatalogApp(catalogId: string): NavApp | null {
  return pinApp(catalogId)
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
    const app = pinApp(catalogId)
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
