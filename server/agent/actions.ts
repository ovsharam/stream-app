import type { AgentIntent, AgentProposal, BookingTaskPayload, AgentActionProposal } from '../../shared/agent-proposal'
import { getConnections } from '../store'
import { isCalcomConnected } from '../sources/calcom'
import { isMondayConnected } from '../sources/monday'
import { isGmailConnected } from '../sources/gmail'
import { bookingTaskToComposeCommand } from './invitee'

const RECRUITER_RE = /\b(recruiter|recruiting|hiring|role|opportunity|position|interview|voicebit|fde|forward deployed)\b/i

function schedulingIntent(intent: AgentIntent): boolean {
  return intent === 'schedule_new' || intent === 'reschedule' || intent === 'confirm'
}

function calcomAction(proposal: AgentProposal, task: BookingTaskPayload): AgentActionProposal {
  let composeText = task.composeCommand
  if (!composeText) {
    try {
      composeText = bookingTaskToComposeCommand(task)
    } catch {
      composeText = `@calcom ${task.action}: ${proposal.senderName}`
    }
  }

  const label =
    task.action === 'reschedule'
      ? 'Reschedule on Cal.com'
      : task.action === 'cancel'
        ? 'Cancel Cal.com booking'
        : 'Book on Cal.com'

  return {
    id: `calcom-${proposal.id}`,
    provider: 'calcom',
    label,
    description:
      task.action === 'reschedule'
        ? 'Move the matched booking to the proposed time'
        : task.action === 'cancel'
          ? 'Cancel the matched Cal.com booking'
          : 'Book the proposed time on Cal.com',
    composeText,
    primary: true
  }
}

export async function buildAgentActionProposals(proposal: AgentProposal): Promise<AgentActionProposal[]> {
  const connections = getConnections()
  const actions: AgentActionProposal[] = []
  const lower = `${proposal.rawMessage} ${proposal.senderName}`.toLowerCase()

  if (proposal.bookingTask && (isCalcomConnected() || connections.calcom)) {
    actions.push(calcomAction(proposal, proposal.bookingTask))
  } else if (schedulingIntent(proposal.intent) && isCalcomConnected()) {
    actions.push({
      id: `calcom-draft-${proposal.id}`,
      provider: 'calcom',
      label: 'Draft Cal.com booking',
      description: 'Resolve invitee email then book',
      composeText: `@calcom book: 30min / invitee@email.com / ${proposal.senderName} / auto / LinkedIn: ${proposal.rawMessage.slice(0, 120)}`,
      optional: true
    })
  }

  if (isMondayConnected() || connections.monday) {
    const topic = RECRUITER_RE.test(lower)
      ? `Recruiting — ${proposal.senderName}`
      : schedulingIntent(proposal.intent)
        ? `Meeting — ${proposal.senderName}`
        : `LinkedIn — ${proposal.senderName}`
    actions.push({
      id: `monday-${proposal.id}`,
      provider: 'monday',
      label: 'Track on Monday',
      description: `Create follow-up item for ${proposal.senderName}`,
      composeText: `@monday create: ${topic} / ${proposal.rawMessage.slice(0, 160)}`,
      optional: !RECRUITER_RE.test(lower)
    })
  }

  if ((await isGmailConnected()) || connections.gmail) {
    if (proposal.inviteeResolution.method === 'unresolved') {
      actions.push({
        id: `contacts-${proposal.id}`,
        provider: 'contacts',
        label: 'Find contact email',
        description: `Match ${proposal.senderName} in Google contacts`,
        composeText: `@contacts ${proposal.senderName}`,
        optional: true
      })
    }
    if (proposal.inviteeResolution.emails[0]) {
      actions.push({
        id: `gmail-${proposal.id}`,
        provider: 'gmail',
        label: 'Email follow-up',
        description: `Draft to ${proposal.inviteeResolution.emails[0]}`,
        composeText: `@gmail send: ${proposal.inviteeResolution.emails[0]} / Re: ${proposal.senderName} / ${proposal.linkedinReplyDraft.slice(0, 200)}`,
        optional: true
      })
    } else if (proposal.intent === 'info_request' || /\?/.test(proposal.rawMessage)) {
      actions.push({
        id: `gmail-search-${proposal.id}`,
        provider: 'gmail',
        label: 'Search Gmail context',
        description: `Look up prior threads with ${proposal.senderName}`,
        composeText: `@gmail search: ${proposal.senderName.split(/\s+/)[0] ?? proposal.senderName}`,
        optional: true
      })
    }
  }

  if (connections.gdocs && (proposal.intent === 'info_request' || RECRUITER_RE.test(lower))) {
    actions.push({
      id: `gdocs-${proposal.id}`,
      provider: 'gdocs',
      label: 'Log to Google Doc',
      description: 'Append thread summary to notes',
      composeText: `@gdocs append: LinkedIn notes / ${proposal.senderName}: ${proposal.rawMessage.slice(0, 180)}`,
      optional: true
    })
  }

  const seen = new Set<string>()
  return actions.filter((a) => {
    const key = `${a.provider}:${a.composeText.slice(0, 80)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function summarizeAgentActions(actions: AgentActionProposal[]): string {
  if (actions.length === 0) return 'Copy the LinkedIn reply'
  const labels = actions.map((a) => a.label)
  if (labels.length === 1) return `${labels[0]} + copy LinkedIn reply`
  if (labels.length === 2) return `${labels[0]} and ${labels[1]} + LinkedIn reply`
  return `${labels.slice(0, 2).join(', ')} + ${labels.length - 2} more + LinkedIn reply`
}
