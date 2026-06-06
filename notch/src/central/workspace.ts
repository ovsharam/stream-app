import type { CalendarRailEvent, CentralStreamEvent } from '@shared/cluster'

export type WorkspaceTabKind = 'pinned' | 'temp'

export type HomePane = 'chat' | 'browser'

export type WorkspaceTab = {
  id: string
  title: string
  source: CentralStreamEvent['source'] | 'calendar' | 'meet' | 'gdocs' | 'youtube' | 'calcom' | 'linkedin' | 'github'
  url: string
  summary: string
  autoOpened?: boolean
  /** pinned = opened from sidebar app; temp = ad-hoc browsing under Home */
  tabKind?: WorkspaceTabKind
  /** nav app id when tabKind is pinned */
  pinId?: string
}

export type PinnedAppSession = {
  pinId: string
  tab: WorkspaceTab
}

export function workspaceTabId(url: string): string {
  try {
    const u = new URL(url)
    const slug = `${u.hostname}${u.pathname}`.replace(/[^a-zA-Z0-9-_]/g, '-')
    return `ws-${slug}`.slice(0, 96)
  } catch {
    return `ws-${url.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 80)}`
  }
}

export function resolveTabKind(tab: WorkspaceTab): WorkspaceTabKind {
  return tab.tabKind ?? (tab.id.startsWith('nav-') || tab.pinId ? 'pinned' : 'temp')
}

export function tabFromUrl(
  url: string,
  opts: {
    title: string
    source?: WorkspaceTab['source']
    summary?: string
    id?: string
    tabKind?: WorkspaceTabKind
    pinId?: string
  }
): WorkspaceTab {
  return {
    id: opts.id ?? workspaceTabId(url),
    title: opts.title,
    source: opts.source ?? 'meet',
    url,
    summary: opts.summary ?? url,
    tabKind: opts.tabKind,
    pinId: opts.pinId
  }
}

export function migrateLegacyTabs(tabs: WorkspaceTab[]): {
  browserTabs: WorkspaceTab[]
  pinnedSession: PinnedAppSession | null
} {
  const browserTabs: WorkspaceTab[] = []
  let pinnedSession: PinnedAppSession | null = null

  for (const tab of tabs) {
    const kind = resolveTabKind(tab)
    if (kind === 'pinned') {
      const pinId = tab.pinId ?? tab.id.replace(/^nav-/, '')
      if (!pinnedSession) {
        pinnedSession = { pinId, tab: { ...tab, tabKind: 'pinned', pinId } }
      }
    } else {
      browserTabs.push({ ...tab, tabKind: 'temp' })
    }
  }

  return { browserTabs, pinnedSession }
}

export function tabFromCalendarEvent(evt: CalendarRailEvent): WorkspaceTab | null {
  if (!evt.link) return null
  return tabFromUrl(evt.link, {
    id: `cal-${evt.id}`,
    title: evt.title,
    source: evt.kind === 'meet' ? 'meet' : 'calendar',
    summary: evt.timeLabel,
    tabKind: 'temp'
  })
}

function sourceUrl(event: CentralStreamEvent): string | null {
  if (event.meetingLink) return event.meetingLink
  if (event.source === 'meeting' && event.meta?.googleDocUrl) {
    return String(event.meta.googleDocUrl)
  }

  const metaUrl = event.meta?.url ? String(event.meta.url) : null
  if (metaUrl?.startsWith('http')) return metaUrl

  if (event.meta?.bookingUid) {
    return `https://app.cal.com/bookings/${String(event.meta.bookingUid)}`
  }

  switch (event.source) {
    case 'slack':
      return 'https://app.slack.com/client'
    case 'gmail':
      return 'https://mail.google.com'
    case 'salesforce':
      return 'https://login.salesforce.com'
    case 'x':
      return 'https://x.com/home'
    case 'monday':
      return 'https://monday.com'
    case 'discord':
      return 'https://discord.com/channels/@me'
    case 'gong':
      return 'https://app.gong.io'
    case 'meet':
      return 'https://meet.google.com'
    case 'gdocs': {
      const docUrl = event.meta?.url ? String(event.meta.url) : null
      return docUrl?.startsWith('http') ? docUrl : null
    }
    case 'calcom': {
      const uid =
        (event.meta?.bookingUid ? String(event.meta.bookingUid) : '') ||
        String(event.meta?.itemId ?? event.id).replace(/^calcom-/, '').replace(/^ext-calcom-/, '')
      return uid ? `https://app.cal.com/bookings/${uid}` : 'https://app.cal.com/bookings/upcoming'
    }
    case 'build':
      return 'https://linear.app'
    case 'notch':
    case 'insight':
      return 'https://notion.so'
    default:
      return null
  }
}

export function toWorkspaceTab(event: CentralStreamEvent): WorkspaceTab | null {
  const url = sourceUrl(event)
  if (!url) return null

  const title =
    event.meetingLink || event.source === 'meet'
      ? event.title || 'Google Meet'
      : event.title || event.source.charAt(0).toUpperCase() + event.source.slice(1)

  return tabFromUrl(url, {
    id: `${event.source}-${event.id}`,
    title,
    source: event.source === 'calcom' ? 'calcom' : event.source,
    summary: event.title || event.body,
    tabKind: 'temp'
  })
}

/** URL to open when clicking a feed item for in-app verification. */
export function feedEventBrowseUrl(event: CentralStreamEvent): string | null {
  return sourceUrl(event)
}
