import type { MondayStatusOption } from '../../shared/cluster'
import {
  createMondayComment,
  getMondayItemContext,
  moveMondayItemStatus,
  type MondayItemContext
} from '../sources/monday'

export type MondayAction =
  | { kind: 'comment'; body: string }
  | { kind: 'move'; statusIndex: number; statusLabel: string }

export type MondayRunResult = {
  ok: boolean
  message: string
  executed: string[]
  actions: MondayAction[]
}

function stripRefs(raw: string): string {
  return raw
    .replace(/^@\s*(this|task|monday|item|here)\b[:\s-]*/i, '')
    .replace(/^#\d+\b[:\s-]*/i, '')
    .trim()
}

function unwrapQuotes(text: string): string {
  const trimmed = text.trim()
  const quoted = trimmed.match(/^["'](.+)["']$/) ?? trimmed.match(/^"(.+)"$/)
  return quoted ? quoted[1].trim() : trimmed
}

function matchStatus(label: string, options: MondayStatusOption[]): MondayStatusOption | null {
  const normalized = unwrapQuotes(label).toLowerCase()
  if (!normalized) return null

  const exact = options.find((o) => o.label.toLowerCase() === normalized)
  if (exact) return exact

  const contains = options.find(
    (o) =>
      o.label.toLowerCase().includes(normalized) || normalized.includes(o.label.toLowerCase())
  )
  if (contains) return contains

  const tokens = normalized.split(/\s+/).filter(Boolean)
  return (
    options.find((o) => {
      const ol = o.label.toLowerCase()
      return tokens.every((t) => ol.includes(t))
    }) ?? null
  )
}

function parseMoveSegment(segment: string, options: MondayStatusOption[]): MondayAction | null {
  const text = segment.trim()
  const patterns = [
    /^(?:move|set|mark|change|update)\s+(?:status\s+)?(?:to|as)\s+(.+)$/i,
    /^status\s*[:=]\s*(.+)$/i,
    /^->\s*(.+)$/i,
    /^(?:done|complete|completed|finished)$/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const label = match[1] ? unwrapQuotes(match[1]) : 'Done'
    const status = matchStatus(label, options)
    if (status) return { kind: 'move', statusIndex: status.index, statusLabel: status.label }
  }

  return null
}

function parseCommentSegment(segment: string): MondayAction | null {
  const text = segment.trim()
  const patterns = [
    /^(?:comment|say|post|reply|add(?:\s+update)?|note|write)\s*:?\s*(.+)$/i,
    /^message\s*:?\s*(.+)$/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]?.trim()) {
      return { kind: 'comment', body: unwrapQuotes(match[1]) }
    }
  }

  return null
}

export function parseMondayNaturalLanguage(
  raw: string,
  statusOptions: MondayStatusOption[]
): MondayAction[] {
  const text = stripRefs(raw)
  if (!text) return []

  const segments = text.split(/\s+(?:and|then|,|·)\s+/i).map((s) => s.trim()).filter(Boolean)
  const actions: MondayAction[] = []

  for (const segment of segments) {
    const move = parseMoveSegment(segment, statusOptions)
    if (move) {
      actions.push(move)
      continue
    }
    const comment = parseCommentSegment(segment)
    if (comment) {
      actions.push(comment)
    }
  }

  if (actions.length > 0) return actions

  const wholeMove = parseMoveSegment(text, statusOptions)
  if (wholeMove) return [wholeMove]

  const wholeComment = parseCommentSegment(text)
  if (wholeComment) return [wholeComment]

  return [{ kind: 'comment', body: text }]
}

export async function runMondayNaturalLanguage(
  itemId: string,
  command: string
): Promise<MondayRunResult> {
  const ctx = await getMondayItemContext(itemId)
  if (!ctx) throw new Error('Could not load Monday task — check connection and item id')

  const actions = parseMondayNaturalLanguage(command, ctx.statusOptions)
  if (actions.length === 0) throw new Error('No action understood from command')

  const executed: string[] = []
  for (const action of actions) {
    if (action.kind === 'comment') {
      await createMondayComment(itemId, action.body)
      executed.push(`Commented: "${action.body.slice(0, 80)}${action.body.length > 80 ? '…' : ''}"`)
      continue
    }
    if (!ctx.statusColumnId) throw new Error('This board has no status column to move')
    await moveMondayItemStatus(ctx.boardId, itemId, ctx.statusColumnId, action.statusIndex)
    executed.push(`Moved to ${action.statusLabel}`)
  }

  const message =
    executed.length === 1 ? executed[0] : `Done: ${executed.join(' · ')}`

  return { ok: true, message, executed, actions }
}

export function mondayContextForHelp(ctx: MondayItemContext): string {
  const statuses = ctx.statusOptions.map((o) => o.label).join(', ')
  return `Task "${ctx.itemTitle}" on ${ctx.boardName}. Current status: ${ctx.currentStatus ?? 'none'}. Available: ${statuses || 'n/a'}.`
}
