import type { MeetingContext } from '@shared/platform-types'
import type { StreamItem } from '@shared/types'
import { DEMO_INITIAL_ITEMS } from './demo-scenarios'

export function createDemoMeetingContext(items: StreamItem[]): MeetingContext {
  const emails = items.filter((i) => i.source === 'gmail').slice(0, 3)
  const slack = items.filter((i) => i.source === 'slack').slice(0, 3)

  return {
    id: 'demo-meeting-1',
    title: 'Acme Corp — Q2 integration review',
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 45 * 60_000),
    attendees: ['Sarah Chen', 'Alex Rivera', 'You'],
    zoomJoinUrl: 'https://zoom.us/j/demo-fde-call',
    prep: {
      goals: [
        'Confirm API migration timeline for customer success',
        'Review staging deploy status from #deployments',
        'Align on SSO ask from last call transcript'
      ],
      openEmails: emails.length ? emails : DEMO_INITIAL_ITEMS.filter((i) => i.source === 'gmail'),
      openSlackThreads: slack.length ? slack : DEMO_INITIAL_ITEMS.filter((i) => i.source === 'slack'),
      recentBuilds: [
        { name: 'stream-app PWA', status: 'staging green', url: '#' },
        { name: 'auth-mcp-layer', status: 'in review', url: '#' }
      ],
      gongHighlights: [
        'Customer mentioned SSO twice in 4 min (Elena, Aircall transcript)',
        'Positive sentiment on unified feed concept'
      ],
      claudeBrief:
        'Sarah’s email is the blocker for CS escalations. Alex confirmed prod window at 3pm PT. Lead with migration date, then SSO timeline.'
    }
  }
}
