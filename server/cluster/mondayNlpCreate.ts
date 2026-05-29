import { queryGemini } from '../sources/gemini'
import { isGeminiConnected } from '../sources/gemini'
import {
  createMondayComment,
  createMondayItem,
  getMondayCreateTarget,
  listMondayBoardCatalog,
  type MondayBoardCatalogEntry
} from '../sources/monday'

export type MondayNlpCreatePlan = {
  itemTitle: string
  itemDescription?: string
  boardHint?: string
  groupHint?: string
}

export type MondayNlpCreateResult = {
  ok: boolean
  message: string
  itemId?: string
  boardName?: string
  groupTitle?: string
  usedGemini: boolean
}

function stripMondayLead(text: string): string {
  return text.replace(/^:\s*/, '').trim()
}

function parseJsonFromModel(raw: string): MondayNlpCreatePlan | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? raw).trim()
  try {
    const parsed = JSON.parse(body) as Partial<MondayNlpCreatePlan>
    if (!parsed.itemTitle?.trim()) return null
    return {
      itemTitle: parsed.itemTitle.trim(),
      itemDescription: parsed.itemDescription?.trim() || undefined,
      boardHint: parsed.boardHint?.trim() || undefined,
      groupHint: parsed.groupHint?.trim() || undefined
    }
  } catch {
    return null
  }
}

function scoreMatch(hint: string, label: string): number {
  const h = hint.toLowerCase().trim()
  const l = label.toLowerCase().trim()
  if (!h || !l) return 0
  if (h === l) return 1
  if (l.includes(h) || h.includes(l)) return 0.85

  const hTokens = h.split(/[\s/&,+-]+/).filter((t) => t.length > 1)
  const lTokens = new Set(l.split(/[\s/&,+-]+/).filter(Boolean))
  if (hTokens.length === 0) return 0
  const hits = hTokens.filter((t) => [...lTokens].some((lt) => lt.includes(t) || t.includes(lt)))
  return hits.length / hTokens.length
}

function resolveBoard(
  catalog: MondayBoardCatalogEntry[],
  boardHint: string | undefined,
  defaultBoardId?: string
): MondayBoardCatalogEntry | null {
  if (catalog.length === 0) return null

  if (defaultBoardId) {
    const saved = catalog.find((b) => b.boardId === defaultBoardId)
    if (saved && !boardHint?.trim()) return saved
  }

  if (!boardHint?.trim()) {
    return catalog[0] ?? null
  }

  let best: MondayBoardCatalogEntry | null = null
  let bestScore = 0
  for (const board of catalog) {
    const s = scoreMatch(boardHint, board.boardName)
    if (s > bestScore) {
      bestScore = s
      best = board
    }
  }
  return bestScore >= 0.4 ? best : null
}

function resolveGroup(
  board: MondayBoardCatalogEntry,
  groupHint?: string
): { id: string; title: string } | null {
  const groups = board.groups
  if (groups.length === 0) return null
  if (!groupHint?.trim()) {
    return groups.find((g) => /new ideas|new features|backlog|to do|todo/i.test(g.title)) ?? groups[0]
  }

  let best: { id: string; title: string } | null = null
  let bestScore = 0
  for (const group of groups) {
    const s = scoreMatch(groupHint, group.title)
    if (s > bestScore) {
      bestScore = s
      best = group
    }
  }
  return bestScore >= 0.35 ? best : null
}

function heuristicPlan(request: string): MondayNlpCreatePlan {
  const text = stripMondayLead(request)

  const addTo = text.match(
    /^(?:add\s+(?:this\s+)?(?:to|in)\s+(?:the\s+)?(?:section\s+)?(?:called\s+)?)?(.+?)(?:\s+section|\s+column|\s+group)?\s*(?:[:\-–—]\s*|\.\s+)(.+)$/is
  )
  if (addTo) {
    const groupHint = addTo[1].trim()
    const body = addTo[2].trim()
    const titleLine = body.split('\n')[0]?.trim() ?? body
    const shortTitle =
      titleLine.length > 90 ? `${titleLine.slice(0, 87)}…` : titleLine.split(/[.!?]/)[0]?.trim() || titleLine
    return {
      itemTitle: shortTitle,
      itemDescription: body,
      groupHint
    }
  }

  const firstLine = text.split('\n')[0]?.trim() ?? text
  const itemTitle =
    firstLine.length > 100 ? `${firstLine.slice(0, 97)}…` : firstLine.split(/[.!?]/)[0]?.trim() || firstLine

  return {
    itemTitle,
    itemDescription: text.length > itemTitle.length ? text : undefined,
    groupHint: /(new ideas|new features)/i.test(text) ? 'new ideas new features' : undefined
  }
}

async function planWithGemini(
  request: string,
  catalog: MondayBoardCatalogEntry[]
): Promise<MondayNlpCreatePlan | null> {
  if (!isGeminiConnected()) return null

  const catalogJson = catalog.map((b) => ({
    boardName: b.boardName,
    groups: b.groups.map((g) => g.title)
  }))

  const system = `You map natural-language Monday.com task requests to structured create plans.
You MUST pick board and group hints that match the user's words against the provided catalog.
If the user mentions a section like "new ideas", "new features", or similar, set groupHint to their wording.
Extract a short itemTitle (max ~80 chars) and put the rest in itemDescription.

Respond with JSON only:
{"itemTitle":"...","itemDescription":"... or omit","boardHint":"... or omit","groupHint":"... or omit"}`

  const user = `Monday boards and groups:\n${JSON.stringify(catalogJson, null, 2)}\n\nUser request:\n${stripMondayLead(request)}`

  try {
    const item = await queryGemini(user, system)
    return parseJsonFromModel(item.body)
  } catch {
    return null
  }
}

export async function createMondayFromNaturalLanguage(
  request: string
): Promise<MondayNlpCreateResult> {
  const catalog = await listMondayBoardCatalog()
  if (catalog.length === 0) {
    return { ok: false, message: 'No Monday boards available — connect Monday in Integrations.', usedGemini: false }
  }

  const geminiPlan = await planWithGemini(request, catalog)
  const plan = geminiPlan ?? heuristicPlan(request)
  const usedGemini = Boolean(geminiPlan)

  const defaultTarget = await getMondayCreateTarget()
  let board =
    resolveBoard(catalog, plan.boardHint, defaultTarget?.boardId) ??
    (defaultTarget ? catalog.find((b) => b.boardId === defaultTarget.boardId) : null) ??
    catalog[0]

  const group = resolveGroup(board, plan.groupHint)
  if (!group) {
    return {
      ok: false,
      message: `Could not match a group for "${plan.groupHint ?? 'default'}" on ${board.boardName}.`,
      usedGemini
    }
  }

  const created = await createMondayItem({
    boardId: board.boardId,
    groupId: group.id,
    name: plan.itemTitle
  })

  if (plan.itemDescription && plan.itemDescription !== plan.itemTitle) {
    await createMondayComment(created.id, plan.itemDescription)
  }

  const via = usedGemini ? 'Gemini' : 'rules'
  return {
    ok: true,
    itemId: created.id,
    boardName: board.boardName,
    groupTitle: group.title,
    usedGemini,
    message: `Created on ${board.boardName} → ${group.title}: ${plan.itemTitle} (${via})`
  }
}
