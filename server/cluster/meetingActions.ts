import { randomUUID } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import type {
  MeetingActionApproval,
  MeetingActionProposal
} from '../../shared/meeting-actions'
import { parseMeetingActionsMeta } from '../../shared/meeting-actions'
import { parseComposeCommand } from '../../shared/compose'
import { getRecentItems, upsertItem } from '../db'
import { runIntegrationAction } from '../integrations/registry'
import {
  createMondayComment,
  createMondayItemOnBoard,
  formatMondayWriteError,
  isMondayConnected,
  mondayHasWriteAccess,
  syncMonday
} from '../sources/monday'
import {
  buildCalcomBookCompose,
  executeCalcomCompose,
  isCalcomConnected,
  syncCalcom
} from '../sources/calcom'
import { transcriptMentionsScheduling } from '../../shared/meeting-extraction'
import { withTimeout } from '../utils/timeout'
import type { StreamItem } from '../../shared/types'
import type { MeetingExtraction, MeetingSession } from './meetingPipeline'

function isMeaningfulBuildPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (trimmed.length <= 40) return false
  if (/^\(no build prompt/i.test(trimmed)) return false
  if (/^\(no transcript/i.test(trimmed)) return false
  return true
}

function meetingLabel(session: MeetingSession): string {
  return session.title ?? new Date(session.startedAt).toLocaleString()
}

function shouldProposeCalcom(extraction: MeetingExtraction): boolean {
  if (extraction.followUpMeeting?.requested) return true
  const blob = [extraction.summary, ...extraction.nextSteps].join('\n')
  return transcriptMentionsScheduling(blob)
}

function calcomProposalDescription(extraction: MeetingExtraction): string {
  const fm = extraction.followUpMeeting
  if (fm?.attendeeEmail && fm.attendeeName) {
    return `Book ${fm.attendeeName} (${fm.attendeeEmail}) for follow-up`
  }
  if (fm?.attendeeEmail) return `Book follow-up with ${fm.attendeeEmail}`
  if (fm?.title) return `${fm.title} — add guest email before approving if missing`
  return 'Schedule follow-up call discussed on the meeting'
}

export function proposeMeetingActions(
  session: MeetingSession,
  extraction: MeetingExtraction
): MeetingActionProposal[] {
  const proposals: MeetingActionProposal[] = []
  const label = meetingLabel(session)

  if (isMeaningfulBuildPrompt(extraction.buildPrompt)) {
    proposals.push({
      id: `cursor-${randomUUID().slice(0, 8)}`,
      provider: 'cursor',
      label: 'Cursor build',
      description:
        extraction.buildPrompt.length > 160
          ? `${extraction.buildPrompt.slice(0, 160)}…`
          : extraction.buildPrompt,
      composeText: `@cursor: ${extraction.buildPrompt.slice(0, 4000)}`
    })
  }

  if (shouldProposeCalcom(extraction)) {
    const fm = extraction.followUpMeeting
    proposals.push({
      id: `calcom-${randomUUID().slice(0, 8)}`,
      provider: 'calcom',
      label: 'Cal.com follow-up',
      description: calcomProposalDescription(extraction),
      composeText: buildCalcomBookCompose({
        title: fm?.title ?? `Follow-up: ${session.title ?? label}`,
        attendeeEmail: fm?.attendeeEmail,
        attendeeName: fm?.attendeeName ?? session.dealHint,
        suggestedStart: fm?.suggestedStart,
        eventTypeSlug: fm?.eventTypeSlug,
        notes: fm?.notes ?? extraction.summary.slice(0, 280)
      })
    })
  }

  if (extraction.nextSteps.length > 0 || extraction.summary.trim()) {
    const taskTitle = session.title?.trim()
      ? `Post-call follow-up: ${session.title.trim()}`
      : 'Post-call follow-up'
    const descriptionLines = [`Meeting: ${label}`]
    if (extraction.nextSteps.length > 0) {
      descriptionLines.push('', ...extraction.nextSteps.map((s) => `• ${s}`))
    } else {
      descriptionLines.push('', extraction.summary.slice(0, 500))
    }
    const description = descriptionLines.join('\n')
    proposals.push({
      id: `monday-followup-${randomUUID().slice(0, 8)}`,
      provider: 'monday',
      label: 'Monday follow-up',
      description:
        extraction.nextSteps.length > 0
          ? `Create task with ${extraction.nextSteps.length} next step(s)`
          : 'Create post-call follow-up task from summary',
      composeText: `@monday create: ${taskTitle} / ${description.slice(0, 1500)}`
    })
  }

  if (proposals.length < 3 && extraction.nextSteps.length > 0) {
    for (let i = 0; i < extraction.nextSteps.length && proposals.length < 3; i += 1) {
      const step = extraction.nextSteps[i]
      proposals.push({
        id: `monday-step-${i}-${randomUUID().slice(0, 8)}`,
        provider: 'monday',
        label: 'Monday task',
        description: step.length > 160 ? `${step.slice(0, 160)}…` : step,
        composeText: `@monday create: ${step.slice(0, 200)}`
      })
    }
  } else if (
    proposals.length < 3 &&
    (extraction.scopeDecision === 'quick_win' || extraction.scopeDecision === 'big_bet')
  ) {
    const scopeLabel = extraction.scopeDecision === 'quick_win' ? 'Quick win' : 'Big bet'
    proposals.push({
      id: `github-scope-${randomUUID().slice(0, 8)}`,
      provider: 'github',
      label: 'GitHub issue',
      description: `${scopeLabel} from meeting — track in repo`,
      composeText: `@github issue: ${label} — ${scopeLabel} / ${extraction.summary.slice(0, 400)}`
    })
  }

  return proposals.slice(0, shouldProposeCalcom(extraction) ? 4 : 3)
}

function readProposals(metadata: Record<string, unknown>): MeetingActionProposal[] {
  const parsed = parseMeetingActionsMeta(metadata)
  if (parsed?.proposedActions.length) return parsed.proposedActions
  if (Array.isArray(metadata.proposedActions)) {
    return metadata.proposedActions as MeetingActionProposal[]
  }
  return []
}

function readApproved(metadata: Record<string, unknown>): Record<string, MeetingActionApproval> {
  const parsed = parseMeetingActionsMeta(metadata)
  if (parsed?.approvedActions) return { ...parsed.approvedActions }
  if (
    metadata.approvedActions &&
    typeof metadata.approvedActions === 'object' &&
    !Array.isArray(metadata.approvedActions)
  ) {
    return { ...(metadata.approvedActions as Record<string, MeetingActionApproval>) }
  }
  return {}
}

function withActionMetadata(
  item: StreamItem,
  proposedActions: MeetingActionProposal[],
  approvedActions: Record<string, MeetingActionApproval>
): StreamItem {
  return {
    ...item,
    metadata: {
      ...item.metadata,
      proposedActions,
      approvedActions
    }
  }
}

function parseMondayCreateBody(body: string): { title: string; description?: string } {
  const slash = body.indexOf(' / ')
  if (slash >= 0) {
    return {
      title: normalizeMondayTaskTitle(body.slice(0, slash).trim()),
      description: body.slice(slash + 3).trim() || undefined
    }
  }
  return { title: normalizeMondayTaskTitle(body.trim()) }
}

/** Legacy proposals used meeting timestamps as titles — keep Monday item names readable. */
function normalizeMondayTaskTitle(title: string): string {
  if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(title)) return title
  const afterDate = title
    .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*[\d:APM\s]+/i, '')
    .replace(/^[—–-]\s*/, '')
    .trim()
  if (afterDate) return afterDate
  return 'Post-call follow-up'
}

/** Direct Monday create — skips Gemini NLP so meeting approve returns in seconds. */
async function executeMondayProposal(
  composeText: string,
  io?: SocketServer
): Promise<{ ok: boolean; message: string; provider: string; executed: string[] }> {
  if (!isMondayConnected()) {
    return { ok: false, message: 'Monday not connected — open Integrations and connect Monday.', provider: 'monday', executed: [] }
  }
  if (!mondayHasWriteAccess()) {
    return {
      ok: false,
      message: formatMondayWriteError('User unauthorized to perform action'),
      provider: 'monday',
      executed: []
    }
  }

  const parsed = parseComposeCommand(composeText)
  if (!parsed || parsed.provider !== 'monday') {
    return { ok: false, message: 'Invalid Monday command', provider: 'monday', executed: [] }
  }

  const { title, description } = parseMondayCreateBody(parsed.body)
  if (!title) {
    return { ok: false, message: 'Task title is empty', provider: 'monday', executed: [] }
  }

  const itemName = title.length > 180 ? `${title.slice(0, 177)}…` : title

  try {
    const created = await withTimeout(
      createMondayItemOnBoard({ name: itemName }),
      45_000,
      'Monday create'
    )

    if (description) {
      try {
        await withTimeout(createMondayComment(created.id, description), 20_000, 'Monday comment')
      } catch (commentErr) {
        console.warn('[meeting] monday comment failed:', commentErr)
      }
    }

    void syncMonday(io).catch((err) => console.warn('[meeting] monday sync failed:', err))

    const taskUrl = `https://monday.com/boards/${created.boardId}/pulses/${created.id}`
    const msg = created.groupTitle
      ? `Created on ${created.boardName} → ${created.groupTitle}: ${itemName}`
      : `Created on ${created.boardName}: ${itemName}`

    return { ok: true, message: `${msg} · ${taskUrl}`, provider: 'monday', executed: [msg] }
  } catch (err) {
    const message = formatMondayWriteError(err instanceof Error ? err.message : String(err))
    return { ok: false, message, provider: 'monday', executed: [] }
  }
}

async function executeCalcomProposal(
  composeText: string,
  io?: SocketServer
): Promise<{ ok: boolean; message: string; provider: string; executed: string[] }> {
  if (!isCalcomConnected()) {
    return {
      ok: false,
      message: 'Cal.com not connected — add API key in Apps → Cal.com or set CALCOM_API_KEY.',
      provider: 'calcom',
      executed: []
    }
  }

  const result = await executeCalcomCompose(composeText)
  if (result.ok) {
    void syncCalcom(io).catch((err) => console.warn('[meeting] calcom sync failed:', err))
  }
  return {
    ok: result.ok,
    message: result.message,
    provider: 'calcom',
    executed: result.ok ? [result.message] : []
  }
}

async function executeMeetingProposal(
  proposal: MeetingActionProposal,
  context: { bareId: string; sessionId: string; io?: SocketServer }
): Promise<{ ok: boolean; message: string; provider?: string; executed?: string[] }> {
  if (proposal.provider === 'monday') {
    return executeMondayProposal(proposal.composeText, context.io)
  }

  if (proposal.provider === 'calcom') {
    return executeCalcomProposal(proposal.composeText, context.io)
  }

  const parsed = parseComposeCommand(proposal.composeText)
  if (!parsed) {
    return { ok: false, message: 'Invalid compose command' }
  }

  return withTimeout(
    runIntegrationAction({
      provider: parsed.provider,
      command: parsed.body,
      raw: proposal.composeText,
      contextItemId: context.bareId,
      sessionId: context.sessionId,
      io: context.io
    }),
    90_000,
    `${parsed.provider} action`
  )
}

export async function approveMeetingAction(input: {
  itemId: string
  actionId: string
  io?: SocketServer
}): Promise<{ ok: boolean; message: string; provider?: string; executed?: string[] }> {
  const bareId = input.itemId.replace(/^ext-/, '')
  const item = getRecentItems(500).find((i) => i.id === bareId || i.id === input.itemId)
  if (!item) {
    return { ok: false, message: 'Meeting feed item not found' }
  }

  const proposedActions = readProposals(item.metadata)
  const approvedActions = readApproved(item.metadata)

  const proposal = proposedActions.find((p) => p.id === input.actionId)
  if (!proposal) {
    return { ok: false, message: 'Action proposal not found' }
  }
  if (approvedActions[input.actionId]?.ok) {
    return { ok: false, message: 'Action already approved' }
  }

  const parsed = parseComposeCommand(proposal.composeText)
  if (!parsed) {
    const approval: MeetingActionApproval = {
      at: Date.now(),
      ok: false,
      message: 'Invalid compose command'
    }
    approvedActions[input.actionId] = approval
    const updated = withActionMetadata(item, proposedActions, approvedActions)
    upsertItem(updated)
    input.io?.emit('stream:item', updated)
    return { ok: false, message: approval.message }
  }

  try {
    const result = await executeMeetingProposal(proposal, {
      bareId,
      sessionId: String(item.metadata.sessionId ?? ''),
      io: input.io
    })

    approvedActions[input.actionId] = {
      at: Date.now(),
      ok: result.ok,
      message: result.message
    }
    const updated = withActionMetadata(item, proposedActions, approvedActions)
    upsertItem(updated)
    input.io?.emit('stream:item', updated)

    return {
      ok: result.ok,
      message: result.message,
      provider: result.provider,
      executed: result.executed
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    approvedActions[input.actionId] = { at: Date.now(), ok: false, message }
    const updated = withActionMetadata(item, proposedActions, approvedActions)
    upsertItem(updated)
    input.io?.emit('stream:item', updated)
    return { ok: false, message }
  }
}
