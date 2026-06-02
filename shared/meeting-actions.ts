import { parseFollowUpMeeting } from './meeting-extraction'

export type MeetingActionProvider = 'monday' | 'cursor' | 'github' | 'calcom'

export type { FollowUpMeetingIntent } from './meeting-extraction'
export {
  parseFollowUpMeeting,
  transcriptMentionsScheduling,
  extractEmailFromText
} from './meeting-extraction'

export type MeetingActionProposal = {
  id: string
  provider: MeetingActionProvider
  label: string
  description: string
  composeText: string
}

export type MeetingActionApproval = {
  at: number
  ok: boolean
  message: string
}

export type MeetingActionsMeta = {
  proposedActions: MeetingActionProposal[]
  approvedActions?: Record<string, MeetingActionApproval>
}

function parseJsonRecord<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function parseProposedActions(raw: unknown): MeetingActionProposal[] | null {
  if (Array.isArray(raw)) return raw as MeetingActionProposal[]
  const parsed = parseJsonRecord<MeetingActionProposal[]>(raw)
  return Array.isArray(parsed) ? parsed : null
}

function parseApprovedActions(raw: unknown): Record<string, MeetingActionApproval> | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, MeetingActionApproval>
  }
  const parsed = parseJsonRecord<Record<string, MeetingActionApproval>>(raw)
  return parsed && typeof parsed === 'object' ? parsed : undefined
}

export function parseMeetingActionsMeta(
  meta: Record<string, unknown> | undefined
): MeetingActionsMeta | null {
  if (!meta) return null

  const proposedActions = parseProposedActions(meta.proposedActions)
  if (!proposedActions || proposedActions.length === 0) return null

  const approvedActions = parseApprovedActions(meta.approvedActions)
  return { proposedActions, approvedActions }
}

export function parseMeetingNextSteps(meta: Record<string, unknown> | undefined): string[] {
  if (!meta?.nextSteps) return []
  if (Array.isArray(meta.nextSteps)) {
    return meta.nextSteps.map((s) => String(s)).filter(Boolean)
  }
  const parsed = parseJsonRecord<string[]>(meta.nextSteps)
  return Array.isArray(parsed) ? parsed.filter(Boolean) : []
}

export function parseMeetingBuildPrompt(meta: Record<string, unknown> | undefined): string {
  return meta?.buildPrompt ? String(meta.buildPrompt).trim() : ''
}

export type MeetingActionDetail = {
  summary: string
  bullets?: string[]
  body?: string
  commandLabel: string
  commandBody: string
}

export function getMeetingActionDetail(
  proposal: MeetingActionProposal,
  meta?: Record<string, unknown>
): MeetingActionDetail {
  const composeMatch = proposal.composeText.match(/^@(\w+)(?:\s+\w+)?:\s*([\s\S]*)$/i)
  const commandLabel = composeMatch ? `@${composeMatch[1]}` : proposal.provider
  const commandBody = (composeMatch?.[2] ?? proposal.composeText).trim()

  if (proposal.provider === 'cursor') {
    const buildPrompt = parseMeetingBuildPrompt(meta)
    return {
      summary: 'Cursor agent will receive this build brief from the call.',
      body: buildPrompt || commandBody,
      commandLabel,
      commandBody: proposal.composeText.replace(/^@\w+(?:\s+\w+)?:\s*/i, '').trim()
    }
  }

  if (proposal.id.startsWith('monday-followup')) {
    const steps = parseMeetingNextSteps(meta)
    const slash = commandBody.indexOf(' / ')
    const taskTitle = slash >= 0 ? commandBody.slice(0, slash).trim() : commandBody
    const taskBody = slash >= 0 ? commandBody.slice(slash + 3).trim() : undefined
    return {
      summary: 'Creates one Monday item with post-call follow-up details.',
      bullets: steps.length > 0 ? steps : undefined,
      body: taskBody ?? (steps.length === 0 ? proposal.description : `Task title: ${taskTitle}`),
      commandLabel: '@monday create',
      commandBody
    }
  }

  if (proposal.provider === 'monday') {
    return {
      summary: 'Creates a separate Monday item for this next step.',
      body: commandBody,
      commandLabel: '@monday create',
      commandBody
    }
  }

  if (proposal.provider === 'github') {
    const slash = commandBody.indexOf(' / ')
    const title = slash >= 0 ? commandBody.slice(0, slash).trim() : commandBody
    const issueBody = slash >= 0 ? commandBody.slice(slash + 3).trim() : undefined
    return {
      summary: 'Opens a GitHub issue to track engineering scope from this call.',
      body: issueBody ? `Title: ${title}\n\n${issueBody}` : title,
      commandLabel: '@github issue',
      commandBody
    }
  }

  if (proposal.provider === 'calcom') {
    const followUp = parseFollowUpMeeting(meta?.followUpMeeting)
    const parts = commandBody.split(' / ').map((p) => p.trim())
    const [eventSlug, email, name, start, ...noteParts] = parts
    const bullets = [
      eventSlug ? `Event: ${eventSlug}` : null,
      name ? `Guest: ${name}` : null,
      email ? `Email: ${email}` : null,
      start ? `When: ${start === 'auto' ? 'Next available slot' : start}` : null,
      followUp?.notes ? `Notes: ${followUp.notes}` : null
    ].filter(Boolean) as string[]
    return {
      summary: 'Books the follow-up on your Cal.com calendar when you approve.',
      bullets: bullets.length ? bullets : undefined,
      body: noteParts.join(' / ') || followUp?.notes || proposal.description,
      commandLabel: '@calcom book',
      commandBody
    }
  }

  return {
    summary: proposal.description,
    commandLabel,
    commandBody
  }
}
