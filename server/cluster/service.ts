import type { AssistResult, ClusterContext, ClusterSearchHit } from '../../shared/cluster'
import { getGraphSignals, getSimSignals, isSimCallActive } from '../sim/engine'
import { getConnections } from '../store'
import { getCachedCalendarEvents } from '../sources/calendar'

const SAY_PATTERNS = /wtf|what do i say|how do i respond|help me answer|what should i say/i
const AGENDA_PATTERNS = /next step|agenda|where do i go|pilot|close/i

export function buildClusterContext(): ClusterContext {
  const live = isSimCallActive()
  const graphSignals = getGraphSignals('acme-corp')
  const liveSignals = getSimSignals()
  const connections = getConnections()
  const calendarEvents = getCachedCalendarEvents()
  const nextMeeting = calendarEvents[0]
  const liveMeeting = calendarEvents.find((e) => e.live)
  const recentSignals = [...liveSignals, ...graphSignals].slice(0, 8).map((s) => ({
    type: s.type,
    content: s.content,
    source: s.speaker ? 'transcript' : 'graph'
  }))
  return {
    activeDeal: {
      id: 'acme-corp',
      company: 'Acme Corp',
      stage: live ? 'Live Call' : 'Discovery',
      acv: 180000,
      healthScore: live ? 67 : 62
    },
    integrations: [
      { id: 'gmail', name: 'Gmail', connected: connections.gmail, configured: true },
      { id: 'slack', name: 'Slack', connected: connections.slack, configured: true },
      { id: 'x', name: 'X', connected: connections.x, configured: true },
      { id: 'monday', name: 'Monday', connected: connections.monday, configured: true },
      { id: 'discord', name: 'Discord', connected: connections.discord, configured: true },
      { id: 'gong', name: 'Gong', connected: false, configured: false },
      {
        id: 'calendar',
        name: 'Google Calendar',
        connected: connections.gmail,
        configured: true,
        lastSync: calendarEvents.length > 0 ? 'synced' : undefined
      }
    ],
    meeting: liveMeeting
      ? {
          id: liveMeeting.id,
          title: liveMeeting.title,
          company: liveMeeting.title.split('—')[0]?.trim() || liveMeeting.title,
          startsInMinutes: 0,
          phase: 'live_call',
          meetingLink: liveMeeting.link
        }
      : nextMeeting
        ? {
            id: nextMeeting.id,
            title: nextMeeting.title,
            company: nextMeeting.title.split('—')[0]?.trim() || nextMeeting.title,
            startsInMinutes: Math.max(
              0,
              Math.round((nextMeeting.startsAt - Date.now()) / 60000)
            ),
            phase: 'pre_call',
            meetingLink: nextMeeting.link
          }
        : null,
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
    recentSignals:
      recentSignals.length > 0
        ? recentSignals
        : [
            { type: 'blocker', content: 'EU data residency requirement', source: 'gong' },
            { type: 'budget', content: '$180k ACV ceiling confirmed', source: 'email' },
            { type: 'champion', content: 'Sarah Kim driving eval', source: 'slack' },
            { type: 'technical', content: 'GDPR Art. 46 / Frankfurt isolation asked', source: 'transcript' }
          ],
    phase: live ? 'live_call' : 'pre_call'
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

export function assistCluster(
  query: string,
  options?: { objective?: 'discovery' | 'v1_ship' }
): AssistResult {
  const q = query.trim()
  const isSay = SAY_PATTERNS.test(q) || /wtf|answer|what is the/i.test(q)
  const isAgenda = AGENDA_PATTERNS.test(q)
  const v1 = options?.objective === 'v1_ship'

  const configResponse = {
    headline: v1 ? 'V1 config — webhook + Frankfurt' : 'Platform config — webhook retries',
    response: v1
      ? 'Jen asked about webhook retry and dead-letter behavior under EU isolation. For V1, propose: Frankfurt-only queue, 3 retries with exponential backoff, DLQ stays in-region. Skip multi-region failover for pilot.'
      : 'Customer is probing webhook retry semantics and dead-letter handling alongside Frankfurt isolation — standard technical eval questions.',
    sayThis: v1
      ? '"For V1 we keep everything in Frankfurt — webhook retries use exponential backoff, max three attempts, and dead letters never leave the EU partition. That\'s the same config Redwood shipped in week one. I can send the exact retry policy doc right after this call."'
      : '"Webhook retries are configurable — default is exponential backoff with a dead-letter queue. For your EU requirement we bind the entire retry pipeline to Frankfurt so nothing transits outside the region. Want me to walk through the exact config?"',
    sources: ['platform-docs', 'redwood-v1-config', 'frankfurt-isolation', 'transcript-live'],
    agendaNext: v1
      ? 'Anchor on minimal V1 scope: Frankfurt isolation + webhook policy doc → book technical sign-off this week.'
      : 'Clarify whether they need custom retry counts or if standard policy meets their SRE runbook.',
    trustNote: v1
      ? 'Objective shifted to V1 — lead with speed and bounded scope, not full enterprise roadmap.'
      : 'Stay consultative — confirm their maintenance windows before promising retry timing.',
    guideQuestions: v1
      ? [
          {
            text: 'What is the minimum Frankfurt config you need live in week one?',
            why: 'Scopes V1 without enterprise roadmap',
            urgent: true
          },
          {
            text: 'Can we use standard webhook retry (3x, in-region DLQ) for the pilot?',
            why: 'Closes Jen\'s technical question with a default',
            urgent: false
          },
          {
            text: 'Who signs off on retry policy — Jen or your platform SRE?',
            why: 'Surfaces decision owner',
            urgent: false
          }
        ]
      : undefined
  }

  const gdprResponse = {
    headline: 'GDPR Art. 46 + Frankfurt isolation',
    response:
      'Jen is asking about GDPR Article 46 compliance and whether you can guarantee Frankfurt region isolation. This is a standard enterprise blocker — address it directly, offer the SCC path, and scope the pilot to EU infrastructure.',
    sayThis:
      '"Great question, Jen. We support EU data residency through Frankfurt region isolation — all pilot data stays in the EU. For GDPR Article 46, we use Standard Contractual Clauses with a pre-signed addendum to our DPA. NovaBank and Redwood HQ cleared legal in under 10 days with the same package. I\'ll send the SCC template right after this call — and we can scope the entire pilot within EU infrastructure so nothing leaves the region."',
    sources: ['security-docs', 'redwood-close', 'novabank-pattern', 'slack-legal'],
    agendaNext: 'Close pilot success definition before Mark pushes timeline — ask what a successful 30-day pilot looks like.',
    trustNote: 'Acknowledge Jen\'s concern explicitly before answering — builds IT trust. Don\'t rush to timeline.',
    guideQuestions: [
      {
        text: 'Can we define pilot success criteria before we talk full rollout timeline?',
        why: 'Load-bearing for Mark\'s timeline question',
        urgent: true
      },
      {
        text: 'Jen — does our SCC + Frankfurt isolation package match your IT checklist?',
        why: 'Direct close on open blocker',
        urgent: false
      },
      {
        text: 'Sarah — who besides legal needs to sign the DPA addendum?',
        why: 'Maps sign-off path',
        urgent: false
      }
    ]
  }

  if (isSay || /webhook|retry|dead.?letter|config|stack|frankfurt|isolation/i.test(q)) {
    return { query: q, intent: 'say_this', ...configResponse }
  }

  if (isSay || /gdpr|residency|scc|compliance|technical/i.test(q)) {
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
