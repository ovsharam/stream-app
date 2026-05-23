import { v4 as uuidv4 } from 'uuid'
import type { StreamItem, StreamSource } from '@shared/types'

export type DemoTemplate = {
  source: StreamSource
  build: () => Omit<StreamItem, 'id' | 'timestamp'>
}

const templates: DemoTemplate[] = [
  {
    source: 'gmail',
    build: () => ({
      source: 'gmail',
      sender: { name: 'Sarah Chen', handle: 'sarah@acme.co' },
      title: 'Re: Q2 API migration timeline',
      body: 'Customer success is getting escalations — can you confirm Monday EOD for the cutover doc?',
      bodyFull:
        'Customer success is getting escalations — can you confirm Monday EOD for the cutover doc? Attaching the thread summary.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'slack',
    build: () => ({
      source: 'slack',
      sender: { name: 'Alex Rivera', handle: '@alex' },
      title: '#deployments',
      body: 'Production window opens 3pm PT. Staging is green — react if you want a hold.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'slack',
    build: () => ({
      source: 'slack',
      sender: { name: 'Jordan Lee', handle: '@jordan' },
      title: '#incidents',
      body: '@you PagerDuty fired for elevated 5xx on /v2/calls — investigating now.',
      isUnread: true,
      isStarred: false,
      reactions: [{ emoji: '👀', count: 3 }],
      metadata: {}
    })
  },
  {
    source: 'x',
    build: () => ({
      source: 'x',
      sender: { name: 'Naval', handle: '@naval' },
      body: 'The best products remove noise. Calm defaults beat feature sprawl every time.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'gmail',
    build: () => ({
      source: 'gmail',
      sender: { name: 'Stripe', handle: 'billing@stripe.com' },
      title: 'Your payout is on the way',
      body: 'A transfer of $4,280.00 USD is expected to arrive in 2 business days.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'slack',
    build: () => ({
      source: 'slack',
      sender: { name: 'Priya Shah', handle: '@priya' },
      title: 'DM',
      body: 'Quick heads up — design wants copy on the onboarding empty state by tonight.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'x',
    build: () => ({
      source: 'x',
      sender: { name: 'Paul Graham', handle: '@paulg' },
      body: 'Startups die from indifference, not competition. Talk to users every day.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'gmail',
    build: () => ({
      source: 'gmail',
      sender: { name: 'Notion Team', handle: 'team@makenotion.com' },
      title: 'Comment on "STREAM PRD"',
      body: 'Maya left a comment: "Love the AI bar context injection — ship it."',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'perplexity',
    build: () => ({
      source: 'perplexity',
      sender: { name: 'Perplexity', handle: 'assistant' },
      title: 'What needs attention right now?',
      body: 'Priority: Slack incident mention in #incidents, then Sarah’s Gmail thread. X is noise — defer.',
      bodyFull:
        'Priority: Slack incident mention in #incidents, then Sarah’s Gmail thread about API migration. Social posts are low urgency.',
      attachments: [
        { type: 'link', name: 'Incident runbook', url: 'https://example.com/runbook' }
      ],
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'slack',
    build: () => ({
      source: 'slack',
      sender: { name: 'Bot: Deploy', handle: 'deploy-bot' },
      title: '#releases',
      body: '✅ v2.14.0 deployed to production (commit 8a3f2c1). Rollback window: 30 min.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'gmail',
    build: () => ({
      source: 'gmail',
      sender: { name: 'Marcus Webb', handle: 'marcus@partner.io' },
      title: 'Partnership follow-up',
      body: 'Following up on our call — can you send the integration checklist before Thursday?',
      isUnread: true,
      isStarred: true,
      metadata: {}
    })
  },
  {
    source: 'x',
    build: () => ({
      source: 'x',
      sender: { name: 'Linear', handle: '@linear' },
      body: 'Changelog: Triage inbox now groups by customer impact score. Available on Business.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'note',
    build: () => ({
      source: 'note',
      sender: { name: 'You', handle: 'local' },
      body: 'Capture: ask Perplexity to summarize incident + email thread before standup.',
      isUnread: false,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'slack',
    build: () => ({
      source: 'slack',
      sender: { name: 'Elena Costa', handle: '@elena' },
      title: '#customer-voice',
      body: 'Transcript landed from Aircall — customer asked about SSO timeline twice in 4 min.',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  },
  {
    source: 'gmail',
    build: () => ({
      source: 'gmail',
      sender: { name: 'GitHub', handle: 'notifications@github.com' },
      title: '[stream-app] PR #42 ready for review',
      body: 'cursor-agent requested your review on "PWA interactive demo layer".',
      isUnread: true,
      isStarred: false,
      metadata: {}
    })
  }
]

let shuffleBag: number[] = []

function nextTemplateIndex(): number {
  if (shuffleBag.length === 0) {
    shuffleBag = templates.map((_, i) => i).sort(() => Math.random() - 0.5)
  }
  return shuffleBag.pop()!
}

export function nextDemoItem(): StreamItem {
  const t = templates[nextTemplateIndex()]
  const partial = t.build()
  return {
    ...partial,
    id: `demo-live-${uuidv4()}`,
    timestamp: new Date()
  }
}

export function isDemoLiveId(id: string): boolean {
  return id.startsWith('demo-live-')
}

export const DEMO_INITIAL_ITEMS: StreamItem[] = [
  {
    id: 'demo-live-seed-1',
    source: 'gmail',
    sender: { name: 'Sarah Chen', handle: 'sarah@acme.co' },
    timestamp: new Date(Date.now() - 8 * 60_000),
    title: 'Q2 roadmap review — action needed',
    body: 'Can you confirm the API migration timeline before Monday?',
    isUnread: true,
    isStarred: false,
    metadata: {}
  },
  {
    id: 'demo-live-seed-2',
    source: 'slack',
    sender: { name: 'Alex Rivera', handle: '@alex' },
    timestamp: new Date(Date.now() - 15 * 60_000),
    title: '#deployments',
    body: 'Staging deploy green. Production window opens at 3pm PT.',
    isUnread: false,
    isStarred: false,
    metadata: {}
  }
]
