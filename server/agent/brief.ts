import type {
  AgentBrief,
  AgentProposal,
  AgentThreadMessage
} from '../../shared/agent-proposal'
import { retrieveContext } from '../kb/pipeline'
import { searchGraph } from '../graph/store'
import { checkProposedSlotFree, formatSlotTimeLabel } from './calendarCheck'

const DEFAULT_TZ = process.env.STREAM_TZ ?? 'America/Los_Angeles'

function threadAsText(messages?: AgentThreadMessage[]): string {
  if (!messages?.length) return ''
  return messages
    .map((m) => {
      const who = m.sender === 'self' ? 'Me' : m.senderName ?? 'Them'
      return `${who}: ${m.text}`
    })
    .join('\n')
}

function contextQuery(proposal: AgentProposal, threadText: string): string {
  const parts = [proposal.senderName, proposal.rawMessage, threadText]
  if (proposal.bookingTask?.inviteeName) parts.push(proposal.bookingTask.inviteeName)
  return parts.filter(Boolean).join(' ').slice(0, 500)
}

function buildHumanSummary(
  proposal: AgentProposal,
  calendarCheck?: AgentBrief['calendarCheck']
): string {
  const sender = proposal.senderName.split(/\s+/)[0] ?? proposal.senderName

  if (proposal.intent === 'reschedule' && calendarCheck?.isFree && calendarCheck.timeLabel) {
    return `${sender} messaged you on LinkedIn to reschedule. ${calendarCheck.timeLabel} is open on your calendar. Want me to accept and move the conversation along?`
  }

  if (proposal.intent === 'reschedule') {
    const slot = calendarCheck?.timeLabel ?? calendarCheck?.proposedIso
    if (slot && !calendarCheck?.isFree) {
      return `${sender} messaged on LinkedIn to reschedule${slot ? ` for ${slot}` : ''}. That slot conflicts with ${calendarCheck?.conflictingEvent ?? 'another event'}. Want me to propose alternatives?`
    }
    return `${sender} messaged you on LinkedIn to reschedule. Want me to accept and move the conversation along?`
  }

  if (proposal.intent === 'schedule_new') {
    const slot = calendarCheck?.timeLabel
    if (slot && calendarCheck?.isFree) {
      return `${sender} reached out on LinkedIn to schedule time. ${slot} looks open on your calendar. Want me to send an invite and reply?`
    }
    return `${sender} reached out on LinkedIn about scheduling. Want me to reply and send calendar options?`
  }

  if (proposal.intent === 'confirm') {
    return `${sender} confirmed on LinkedIn. Want me to acknowledge and lock in the meeting?`
  }

  if (proposal.intent === 'decline') {
    return `${sender} may need to decline or move a meeting on LinkedIn. Want me to handle the reply?`
  }

  return `${sender} messaged you on LinkedIn. Want me to draft a reply and take the next step?`
}

function buildSuggestedAction(proposal: AgentProposal): string {
  if (proposal.bookingTask?.action === 'reschedule') {
    return 'Approve to reschedule on Cal.com and copy the LinkedIn reply'
  }
  if (proposal.bookingTask?.action === 'book') {
    return 'Approve to book on Cal.com and copy the LinkedIn reply'
  }
  return 'Approve to copy the LinkedIn reply to your clipboard'
}

export async function buildAgentBrief(
  proposal: AgentProposal,
  threadMessages?: AgentThreadMessage[]
): Promise<AgentBrief> {
  const threadText = threadAsText(threadMessages ?? proposal.threadMessages)
  const query = contextQuery(proposal, threadText)

  const kb = retrieveContext(query, 6)
  const kbExcerpts = kb.chunks.slice(0, 3).map((c) => c.excerpt).filter(Boolean)

  const graphResults = searchGraph(proposal.senderName, 4)
  const graphHits = graphResults.slice(0, 3).map((r) => ({
    title: r.title,
    subtitle: r.subtitle
  }))

  let calendarCheck: AgentBrief['calendarCheck']
  const proposedIso = proposal.bookingTask?.proposedTimes?.[0]
  if (proposedIso) {
    calendarCheck = checkProposedSlotFree(proposedIso, proposal.bookingTask?.durationMin ?? 30)
  } else if (proposal.intent === 'reschedule' || proposal.intent === 'schedule_new') {
    const parsed = proposal.rawMessage.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    if (parsed) {
      calendarCheck = { isFree: false, timeLabel: parsed[1] }
    }
  }

  const humanSummary = buildHumanSummary(proposal, calendarCheck)
  const suggestedAction = buildSuggestedAction(proposal)

  return {
    humanSummary,
    suggestedAction,
    calendarCheck,
    kbExcerpts: kbExcerpts.length ? kbExcerpts : undefined,
    graphHits: graphHits.length ? graphHits : undefined
  }
}

export { formatSlotTimeLabel, threadAsText, DEFAULT_TZ }
