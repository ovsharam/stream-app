import type {
  AgentBrief,
  AgentIntent,
  AgentProposal,
  AgentProposalStatus,
  AgentThreadMessage
} from './agent-proposal'
import { lastInboundThreadMessage, looksLikeOutboundToContact } from './linkedin-ingest'

export type ProposalUrgency = 'high' | 'normal' | 'low'

export type AgentProposalFeedCardData = {
  proposalId: string
  status?: AgentProposalStatus
  brief?: AgentBrief
  linkedinReplyDraft: string
  senderName: string
  rawMessage: string
  threadId?: string
  threadMessages?: AgentThreadMessage[]
  channel?: string
  intent?: AgentIntent
  detectedAt: number
  createdAt: number
  urgency: ProposalUrgency
}

const SCHEDULING_INTENTS: AgentIntent[] = ['schedule_new', 'reschedule', 'confirm']

function parseJsonRecord<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function metaBrief(meta: Record<string, unknown> | undefined): AgentBrief | undefined {
  if (!meta) return undefined
  if (meta.agentBrief && typeof meta.agentBrief === 'object' && !Array.isArray(meta.agentBrief)) {
    return meta.agentBrief as AgentBrief
  }
  return parseJsonRecord<AgentBrief>(meta.agentBrief) ?? undefined
}

export function computeProposalUrgency(input: {
  intent?: AgentIntent
  brief?: AgentBrief
}): ProposalUrgency {
  const intent = input.intent
  if (intent && SCHEDULING_INTENTS.includes(intent)) {
    const calendar = input.brief?.calendarCheck
    if (calendar && !calendar.isFree) return 'high'
    return 'normal'
  }
  return 'low'
}

export function urgencyLabel(
  urgency: ProposalUrgency,
  intent?: AgentIntent,
  brief?: AgentBrief
): string | null {
  if (urgency !== 'high') return null
  const calendar = brief?.calendarCheck
  if (calendar?.conflictingEvent) {
    return `Scheduling — calendar conflict`
  }
  if (intent) {
    return `Scheduling — ${intent.replace(/_/g, ' ')}`
  }
  return 'Scheduling — needs attention'
}

export function formatProposalAge(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function formatProposalReceived(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(ts))
}

const JOB_TITLE_TAIL =
  /\s+(?:People\s*&\s*Talent|Recruiter|Talent Acquisition|HR|Hiring Manager|Director|Partner|Founder|CEO|CTO|Engineer|Lead|Head of[\s\S]*)/i

/** Strip LinkedIn UI chrome from scraped sender labels. */
export function cleanLinkedInSenderName(name: string): string {
  let s = name.replace(/\s+Status is offline[\s\S]*$/i, '').replace(/\s+/g, ' ').trim()
  s = s.replace(/\s+View .+?'s profile[\s\S]*$/i, '').trim()
  s = s.replace(JOB_TITLE_TAIL, '').trim()
  if (s.length > 48) {
    const parts = s.split(/\s+/)
    s = parts.slice(0, 3).join(' ')
  }
  return s || name.trim().split(/\s+/).slice(0, 3).join(' ')
}

function shortenUrl(url: string): string {
  if (/calendly|cal\.com|calendar\.google/i.test(url)) return '[scheduling link]'
  if (url.length > 36) return '[link]'
  return url
}

/** Trim scraped thread DOM down to a readable message snippet. */
export function cleanLinkedInMessage(raw: string, senderName?: string): string {
  let text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return ''

  if (senderName) {
    const cleanSender = cleanLinkedInSenderName(senderName)
    if (cleanSender.length > 2) {
      const escaped = cleanSender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      text = text.replace(new RegExp(`^${escaped}[^a-z]*`, 'i'), '').trim()
    }
  }

  text = text.replace(/\s*Status is (offline|online)[\s\S]*/i, '').trim()
  text = text.replace(/\s*View .+?'s profile[\s\S]*/i, '').trim()
  text = text.replace(/\s*Open the options list[\s\S]*/i, '').trim()
  text = text.replace(/https?:\/\/[^\s]+/g, shortenUrl)
  text = text.replace(/\b[A-Z][a-z]{2,}(?:[A-Z][a-z]{2,}){3,}\b/g, ' ')
  text = text.replace(/\s{2,}/g, ' ').trim()

  const sentences = text.match(/[^.!?]+[.!?]+/g)
  if (sentences?.length) {
    text = sentences.slice(0, 2).join(' ').trim()
  }

  if (text.length > 280) text = `${text.slice(0, 277).trim()}…`
  return text
}

export function proposalLeadLine(input: {
  rawMessage: string
  senderName: string
  brief?: AgentBrief
}): string {
  const summary = input.brief?.humanSummary?.trim()
  if (summary && !/^[\w\s]+ messaged you on LinkedIn\. Want me to draft/i.test(summary)) {
    return summary
  }
  const cleaned = cleanLinkedInMessage(input.rawMessage, input.senderName)
  if (cleaned.length >= 24) return cleaned
  if (summary) return summary
  return `${cleanLinkedInSenderName(input.senderName)} reached out on LinkedIn.`
}

export function proposalInboundMessage(input: {
  rawMessage: string
  senderName: string
  threadMessages?: AgentThreadMessage[]
}): { text: string; fromThem: boolean } {
  const inbound = lastInboundThreadMessage(input.threadMessages)
  if (inbound?.text.trim()) {
    return {
      text: cleanLinkedInMessage(inbound.text, input.senderName),
      fromThem: true
    }
  }
  if (looksLikeOutboundToContact(input.rawMessage, input.senderName)) {
    return {
      text: cleanLinkedInMessage(input.rawMessage, input.senderName),
      fromThem: false
    }
  }
  return {
    text: cleanLinkedInMessage(input.rawMessage, input.senderName),
    fromThem: true
  }
}

/** One-line summary for compact inbox cards. */
export function summarizeProposalText(text: string, maxLen = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const sentence = t.match(/^[^.!?]+[.!?]/)?.[0]?.trim()
  const base = sentence && sentence.length >= 16 ? sentence : t
  if (base.length <= maxLen) return base
  const cut = base.slice(0, maxLen - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

export function summarizeTheirMessage(input: {
  rawMessage: string
  senderName: string
  brief?: AgentBrief
  threadMessages?: AgentThreadMessage[]
}): string {
  const { text, fromThem } = proposalInboundMessage(input)
  if (!fromThem) {
    const name = cleanLinkedInSenderName(input.senderName)
    return `You messaged ${name} — no reply needed until they respond.`
  }
  return summarizeProposalText(proposalLeadLine({ ...input, rawMessage: text }), 140)
}

export function summarizeReplyDraft(draft: string): string {
  return summarizeProposalText(draft, 110)
}

/** @deprecated Use summarizeTheirMessage */
export function summarizeInboundMessage(input: {
  rawMessage: string
  senderName: string
  brief?: AgentBrief
  threadMessages?: AgentThreadMessage[]
}): string {
  return summarizeTheirMessage(input)
}

export function parseAgentProposalFeedMeta(
  meta: Record<string, unknown> | undefined,
  event?: { body?: string; ts?: number }
): AgentProposalFeedCardData | null {
  if (!meta?.agentProposalId) return null

  const proposalId = String(meta.agentProposalId)
  const status = meta.agentProposalStatus
    ? (String(meta.agentProposalStatus) as AgentProposalStatus)
    : undefined
  const brief = metaBrief(meta)
  const intent = meta.intent ? (String(meta.intent) as AgentIntent) : undefined
  const detectedAt = meta.detectedAt != null ? Number(meta.detectedAt) : event?.ts ?? Date.now()
  const createdAt = meta.createdAt != null ? Number(meta.createdAt) : detectedAt
  const rawMessage =
    (meta.rawMessage != null ? String(meta.rawMessage) : '') || event?.body || ''
  const linkedinReplyDraft =
    meta.linkedinReplyDraft != null ? String(meta.linkedinReplyDraft) : ''

  return {
    proposalId,
    status,
    brief,
    linkedinReplyDraft,
    senderName: meta.senderName != null ? String(meta.senderName) : 'LinkedIn',
    rawMessage,
    threadId: meta.threadId != null ? String(meta.threadId) : undefined,
    channel: meta.channel != null ? String(meta.channel) : 'LinkedIn',
    intent,
    detectedAt,
    createdAt,
    urgency:
      meta.urgency != null
        ? (String(meta.urgency) as ProposalUrgency)
        : computeProposalUrgency({ intent, brief })
  }
}

export function agentProposalToCardData(proposal: AgentProposal): AgentProposalFeedCardData {
  return {
    proposalId: proposal.id,
    status: proposal.status,
    brief: proposal.brief,
    linkedinReplyDraft: proposal.linkedinReplyDraft,
    senderName: proposal.senderName,
    rawMessage: proposal.rawMessage,
    threadId: proposal.threadId,
    threadMessages: proposal.threadMessages,
    channel: 'LinkedIn',
    intent: proposal.intent,
    detectedAt: proposal.detectedAt ?? proposal.createdAt,
    createdAt: proposal.createdAt,
    urgency: computeProposalUrgency({ intent: proposal.intent, brief: proposal.brief })
  }
}
