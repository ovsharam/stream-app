import type { AssistResult, ClusterContext, ClusterSearchHit } from '../../shared/cluster'

const SAY_PATTERNS = /wtf|what do i say|how do i respond|help me answer|what should i say/i
const AGENDA_PATTERNS = /next step|agenda|where do i go|pilot|close/i

export function buildClusterContext(): ClusterContext {
  return {
    activeDeal: {
      id: 'acme-corp',
      company: 'Acme Corp',
      stage: 'Discovery',
      acv: 180000,
      healthScore: 62
    },
    integrations: [
      { id: 'gmail', name: 'Gmail', connected: true, configured: true, lastSync: '2m ago' },
      { id: 'slack', name: 'Slack', connected: true, configured: true, lastSync: '5m ago' },
      { id: 'salesforce', name: 'Salesforce', connected: true, configured: true, lastSync: '12m ago' },
      { id: 'gong', name: 'Gong', connected: true, configured: true, lastSync: '1h ago' },
      { id: 'calendar', name: 'Google Calendar', connected: true, configured: true, lastSync: 'live' },
      { id: 'notion', name: 'Notion', connected: false, configured: true }
    ],
    meeting: {
      id: 'mtg-acme-tech',
      title: 'Acme Corp — Technical Deep Dive',
      company: 'Acme Corp',
      startsInMinutes: 0,
      phase: 'live_call',
      meetingLink: 'https://zoom.us/j/demo'
    },
    actions: [
      {
        id: 'a1',
        type: 'email',
        label: 'Draft follow-up with SCC template',
        status: 'ready',
        dealId: 'acme-corp'
      },
      {
        id: 'a2',
        type: 'salesforce',
        label: 'Update stage → Technical Eval',
        status: 'applied',
        dealId: 'acme-corp'
      },
      {
        id: 'a3',
        type: 'build',
        label: 'Build brief — pilot scope threshold',
        status: 'queued',
        dealId: 'acme-corp'
      },
      {
        id: 'a4',
        type: 'slack',
        label: 'Notify #legal on SCC request',
        status: 'queued',
        dealId: 'acme-corp'
      }
    ],
    recentSignals: [
      { type: 'blocker', content: 'EU data residency requirement', source: 'gong' },
      { type: 'budget', content: '$180k ACV ceiling confirmed', source: 'email' },
      { type: 'champion', content: 'Sarah Kim driving eval', source: 'slack' },
      { type: 'technical', content: 'GDPR Art. 46 / Frankfurt isolation asked', source: 'transcript' }
    ],
    phase: 'live_call'
  }
}

export function searchCluster(q: string): ClusterSearchHit[] {
  const corpus: ClusterSearchHit[] = [
    {
      id: 'h1',
      title: 'EU data residency — cross-case pattern',
      snippet: 'NovaBank resolved in 48h with SCC. Pineapple stalled 3 weeks without IT sign-off.',
      source: 'graph',
      score: 0.96
    },
    {
      id: 'h2',
      title: 'Redwood HQ reference',
      snippet: 'Similar scale, Frankfurt isolation, legal cleared SCC in 9 days. CISO: Dana Chen.',
      source: 'gong',
      score: 0.91
    },
    {
      id: 'h3',
      title: 'SCC template + DPA addendum',
      snippet: 'Pre-signed SCC addendum — legal typically clears in under 10 days.',
      source: 'drive',
      score: 0.89
    },
    {
      id: 'h4',
      title: 'Pilot success criteria',
      snippet: 'Ask: what does a successful 30-day pilot look like? Close on that before timeline.',
      source: 'prep',
      score: 0.87
    },
    {
      id: 'h5',
      title: 'Sarah Kim — champion notes',
      snippet: 'Technically sharp. Prefers directness. Budget confirmed, needs legal/IT sign-off.',
      source: 'email',
      score: 0.85
    },
    {
      id: 'h6',
      title: 'Mark O\'Brien — economic buyer',
      snippet: 'Added late. Likely pressure on cost/timeline. Confirm pilot scope before budget talk.',
      source: 'calendar',
      score: 0.82
    }
  ]

  if (!q.trim()) return corpus.slice(0, 4)

  const lower = q.toLowerCase()
  return corpus
    .filter(
      (h) =>
        h.title.toLowerCase().includes(lower) ||
        h.snippet.toLowerCase().includes(lower) ||
        lower.split(/\s+/).some((w) => w.length > 2 && h.snippet.toLowerCase().includes(w))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

export function assistCluster(query: string, liveContext?: string): AssistResult {
  const q = query.trim()
  const isSay = SAY_PATTERNS.test(q)
  const isAgenda = AGENDA_PATTERNS.test(q)

  const gdprResponse = {
    headline: 'GDPR Art. 46 + Frankfurt isolation',
    response:
      'Jen is asking about GDPR Article 46 compliance and whether you can guarantee Frankfurt region isolation. This is a standard enterprise blocker — address it directly, offer the SCC path, and scope the pilot to EU infrastructure.',
    sayThis:
      '"Great question, Jen. We support EU data residency through Frankfurt region isolation — all pilot data stays in the EU. For GDPR Article 46, we use Standard Contractual Clauses with a pre-signed addendum to our DPA. NovaBank and Redwood HQ cleared legal in under 10 days with the same package. I\'ll send the SCC template right after this call — and we can scope the entire pilot within EU infrastructure so nothing leaves the region."',
    sources: ['security-docs', 'redwood-close', 'novabank-pattern', 'slack-legal'],
    agendaNext: 'Close pilot success definition before Mark pushes timeline — ask what a successful 30-day pilot looks like.',
    trustNote: 'Acknowledge Jen\'s concern explicitly before answering — builds IT trust. Don\'t rush to timeline.'
  }

  if (isSay || /gdpr|residency|frankfurt|scc|compliance|technical/i.test(q)) {
    return {
      query: q,
      intent: 'say_this',
      ...gdprResponse
    }
  }

  if (isAgenda) {
    return {
      query: q,
      intent: 'agenda',
      headline: 'Next step on agenda',
      response:
        'You have two open loops: (1) pilot success criteria not defined — Mark will stall on timeline without it, (2) SCC template promised to Jen. Close the pilot definition first, then confirm SCC follow-up.',
      sayThis:
        '"Before we talk timeline, I want to make sure we\'re aligned on what success looks like in the first 30 days — can we define that together now? Then I\'ll get the SCC template to Jen today."',
      sources: ['prep', 'transcript', 'load-bearing-gaps'],
      agendaNext: 'Define 30-day pilot success → confirm SCC send → schedule IT sign-off criteria in writing',
      trustNote: 'Mark cares about commitment scope — frame pilot as bounded, not open-ended.'
    }
  }

  const hits = searchCluster(q)
  const top = hits[0]

  return {
    query: q,
    intent: 'search',
    headline: top?.title ?? 'Context search',
    response: top?.snippet ?? 'No direct match — try asking "what do I say about GDPR?" during live calls.',
    sayThis: top
      ? `"Based on what we've seen with similar customers — ${top.snippet.split('.')[0]}. Happy to walk through specifics."`
      : '"Let me make sure I give you a precise answer — can you help me understand the specific concern?"',
    sources: hits.slice(0, 3).map((h) => h.source),
    trustNote: 'When uncertain, ask a clarifying question — preserves CSAT better than guessing.'
  }
}
