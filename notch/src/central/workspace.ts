import type { CentralStreamEvent } from '@shared/cluster'

export type WorkspaceTab = {
  id: string
  title: string
  source: CentralStreamEvent['source']
  url: string
  summary: string
}

function sourceUrl(event: CentralStreamEvent): string | null {
  if (event.meetingLink) return event.meetingLink

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

  return {
    id: `${event.source}-${event.id}`,
    title: event.source.charAt(0).toUpperCase() + event.source.slice(1),
    source: event.source,
    url,
    summary: event.title || event.body
  }
}
