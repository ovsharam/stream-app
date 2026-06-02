import type { AssistResult, ClusterContext, ClusterSearchHit } from '../../shared/cluster'
import { cleanAssistField, cleanKbExcerpt, formatChatAssistBody } from '../../shared/assistText'
import { buildAttentionDigest } from '../../shared/attentionDigest'
import { sanitizeDisplayText } from '../../shared/displayText'
import { getGraphSignals, getSimSignals, isSimCallActive } from '../sim/engine'
import { getConnections } from '../store'
import { getCachedCalendarEvents } from '../sources/calendar'
import { getRecentItems } from '../db'

const SAY_PATTERNS = /wtf|what do i say|how do i respond|help me answer|what should i say/i
const AGENDA_PATTERNS = /next step|agenda|where do i go|pilot|close/i
const ATTENTION_PATTERNS = /attention|priorit|today|open loops|what needs/i

function bodyFromSearchHit(hit: ClusterSearchHit): string {
  const item = getRecentItems(400).find((i) => i.id === hit.id)
  const body = item ? String(item.bodyFull ?? item.body ?? item.title ?? '') : hit.snippet
  return formatChatAssistBody(body)
}

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
  const query = q.trim().toLowerCase()
  if (!query) return []

  const terms = query.split(/\s+/).filter((w) => w.length > 1)
  const wantsMonday = /\bmonday\b/i.test(query)
  const wantsTasks = /\btasks?\b/i.test(query)
  const items = getRecentItems(400)
  const hits: ClusterSearchHit[] = []

  for (const item of items) {
    const title = String(item.title ?? '')
    const body = String(item.body ?? '')
    const sender = String(item.sender?.name ?? '')
    const hay = `${title} ${body} ${sender} ${item.source}`.toLowerCase()

    const matches =
      hay.includes(query) ||
      (terms.length > 0 && terms.every((t) => hay.includes(t)))
    if (!matches) continue

    let score = 0.5
    if (title.toLowerCase().includes(query)) score += 1.5
    if (body.toLowerCase().includes(query)) score += 1
    for (const t of terms) {
      if (title.toLowerCase().includes(t)) score += 0.4
      if (body.toLowerCase().includes(t)) score += 0.25
    }
    if (item.source === 'monday' || item.source === 'gmail') score += 0.15
    if (wantsMonday && item.source === 'monday') score += 1.2
    if (wantsTasks && (item.source === 'monday' || /task|item|todo/i.test(`${title} ${body}`))) score += 0.6

    const itemId = String(item.metadata?.itemId ?? item.id).replace(/^ext-/, '')
    hits.push({
      id: item.id,
      title: sanitizeDisplayText(title.trim() || body.slice(0, 72).trim() || item.source, 120),
      snippet: sanitizeDisplayText(body.slice(0, 160).trim() || title, 160),
      source: item.source,
      score,
      itemId,
      day: item.metadata?.day ? String(item.metadata.day) : undefined
    })
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 14)
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

  if (isAgenda || ATTENTION_PATTERNS.test(q)) {
    const digest = buildAttentionDigest(getRecentItems(40))
    if (digest) {
      return {
        query: q,
        intent: 'agenda',
        headline: 'Today',
        response: digest,
        sayThis:
          '"Let me walk through the top items on your plate — we can knock out the quick ones first."',
        sources: [...new Set(getRecentItems(8).map((i) => i.source))],
        agendaNext: 'Review tasks → confirm calendar → skim FYI inbox',
        trustNote: 'Prioritize items with external deadlines or waiting stakeholders.'
      }
    }

    return {
      query: q,
      intent: 'agenda',
      headline: 'Today',
      response:
        'Nothing urgent flagged yet — connect Gmail or Monday in Apps, or start a meeting to capture context.',
      sayThis:
        '"Once your integrations sync, I can surface priorities here — want to connect email or calendar now?"',
      sources: [],
      agendaNext: 'Review top inbox items → confirm meeting prep → close one open loop before EOD',
      trustNote: 'Prioritize items with external deadlines or waiting stakeholders.'
    }
  }

  const hits = searchCluster(q)
  const top = hits[0]
  const responseBody = top
    ? bodyFromSearchHit(top)
    : 'No direct match — try asking "what do I say about GDPR?" during live calls.'

  return {
    query: q,
    intent: 'search',
    headline: top?.title ?? 'Context search',
    response: responseBody,
    sayThis: top
      ? (() => {
          const first = cleanKbExcerpt(top.snippet.split(/[.!?]/)[0] ?? top.snippet, 120)
          return first ? `"${first}."` : ''
        })()
      : '"Let me make sure I give you a precise answer — can you help me understand the specific concern?"',
    sources: hits.slice(0, 3).map((h) => h.source),
    trustNote: 'When uncertain, ask a clarifying question — preserves CSAT better than guessing.'
  }
}
