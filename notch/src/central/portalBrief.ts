import type { CalendarRailEvent, CentralStreamEvent, PerplexityNewsItem } from '@shared/cluster'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'

const DAY_MS = 86_400_000

export type PortalBrief = {
  refreshedAt: number
  greeting: string
  dateLabel: string
  headline: string
  lead: string
  bullets: string[]
}

export type OvernightItem = {
  id: string
  source?: string
  excerpt: string
  ingestedAt: number
}

export type PortalSnapshot = {
  brief: PortalBrief
  overnight: OvernightItem[]
  pendingMeetings: { id: string; title: string; count: number }[]
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatRefreshed(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function buildPortalBrief(input: {
  calendar: CalendarRailEvent[]
  meetings: CentralStreamEvent[]
  overnight: OvernightItem[]
  refreshedAt?: number
}): PortalBrief {
  const now = new Date()
  const refreshedAt = input.refreshedAt ?? Date.now()
  const todayEvents = input.calendar.filter((e) => e.dayIndex === 0 && !e.ended)
  const nextEvent =
    input.calendar.find((e) => !e.ended && e.startsAt >= Date.now() - 15 * 60_000) ?? todayEvents[0]

  let pendingApprovals = 0
  for (const m of input.meetings) {
    const meta = parseMeetingActionsMeta(m.meta)
    if (!meta) continue
    pendingApprovals += meta.proposedActions.filter((p) => !meta.approvedActions?.[p.id]?.ok).length
  }

  const bullets: string[] = []
  if (pendingApprovals > 0) {
    bullets.push(`${pendingApprovals} post-call ${pendingApprovals === 1 ? 'task' : 'tasks'} ready to route`)
  }
  if (todayEvents.length > 0) {
    bullets.push(`${todayEvents.length} on calendar today`)
  }
  if (input.overnight.length > 0) {
    bullets.push(`${input.overnight.length} agent ${input.overnight.length === 1 ? 'update' : 'updates'} since yesterday`)
  }

  let headline: string
  if (pendingApprovals > 0 && nextEvent) {
    headline = `Route ${pendingApprovals} before ${nextEvent.title}`
  } else if (pendingApprovals > 0) {
    headline = `${pendingApprovals} tasks waiting on you`
  } else if (nextEvent?.live) {
    headline = `${nextEvent.title} is live now`
  } else if (nextEvent) {
    headline = `Up first: ${nextEvent.title}`
  } else if (input.overnight.length > 0) {
    headline = 'Agents finished overnight — you\'re clear to start'
  } else {
    headline = 'Clear morning — no blockers'
  }

  const lead =
    bullets.length > 0
      ? `${bullets.join(' · ')}. Your portal refreshes every 24 hours as agents finish work.`
      : 'No overnight blockers. Connect Gmail for calendar prep, or ask the search bar anything about your deals and tasks.'

  return {
    refreshedAt,
    greeting: greetingForHour(now.getHours()),
    dateLabel: now.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }),
    headline,
    lead,
    bullets
  }
}

export function overnightFromKb(
  recent: { id: string; excerpt: string; source?: string; ingestedAt: number }[]
): OvernightItem[] {
  const cutoff = Date.now() - DAY_MS
  return recent
    .filter((r) => r.ingestedAt >= cutoff)
    .sort((a, b) => b.ingestedAt - a.ingestedAt)
    .slice(0, 8)
}

export function portalStorageKey(): string {
  return `stream.portal.${new Date().toISOString().slice(0, 10)}`
}

export function readCachedPortal(): PortalSnapshot | null {
  try {
    const raw = localStorage.getItem(portalStorageKey())
    return raw ? (JSON.parse(raw) as PortalSnapshot) : null
  } catch {
    return null
  }
}

export function writeCachedPortal(snapshot: PortalSnapshot): void {
  try {
    localStorage.setItem(portalStorageKey(), JSON.stringify(snapshot))
  } catch {
    /* quota */
  }
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function sourceLabel(source?: string): string {
  if (!source) return 'Agent'
  const labels: Record<string, string> = {
    monday: 'Monday',
    gmail: 'Gmail',
    meeting: 'Meeting',
    mind: 'Mind',
    slack: 'Slack',
    calcom: 'Cal.com'
  }
  return labels[source] ?? source.charAt(0).toUpperCase() + source.slice(1)
}

export function newsHeadlines(items: PerplexityNewsItem[], limit = 4): PerplexityNewsItem[] {
  return items.slice(0, limit)
}
