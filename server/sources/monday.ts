import type { Server as SocketServer } from 'socket.io'
import { normalizeMondayUpdate } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'
import type { MondayAccount } from '../../shared/cluster'
import { FEED_HISTORY_MS } from '../../shared/feed'

type MondayToken = {
  apiToken: string
  userId?: string
  userName?: string
  userEmail?: string
  lastSyncMs?: number
  /** One-time 7-day feed backfill completed for this connection. */
  feedBackfilledAt?: number
  defaultBoardId?: string
  defaultBoardName?: string
  defaultGroupId?: string
  defaultGroupTitle?: string
  /** false when token can sync but not create items */
  writeAccess?: boolean
}

export function formatMondayWriteError(message: string): string {
  if (/unauthorized|403|forbidden|permission|scope/i.test(message)) {
    return (
      'Monday API token is read-only — it can sync the feed but cannot create tasks. ' +
      'Go to monday.com → profile → Developers → My access tokens, create a token with ' +
      'boards:write and updates:write, then Integrations → Monday → paste the new token.'
    )
  }
  return message
}

async function probeMondayWriteAccess(apiToken: string): Promise<boolean> {
  try {
    const catalog = await mondayApiWithToken<{
      boards: { id: string; name: string; groups: { id: string }[] }[]
    }>(
      apiToken,
      `
        query NotchMondayWriteProbe {
          boards(limit: 50) {
            id
            name
            groups { id title }
          }
        }
      `
    )
    const targets: MondayBoardTarget[] = catalog.boards
      .filter((b) => !isSubitemsBoard(b.name))
      .map((b) => ({
        boardId: b.id,
        boardName: b.name,
        groupId: pickCreateGroup(b.groups)?.id,
        groupTitle: pickCreateGroup(b.groups)?.title
      }))
    const board = resolveDefaultCreateBoard(targets, null)
    const catalogBoard = catalog.boards.find((b) => b.id === board.boardId)
    const groupId = board.groupId ?? catalogBoard?.groups[0]?.id
    if (!groupId) return false

    const created = await mondayApiWithToken<{ create_item: { id: string } | null }>(
      apiToken,
      `
        mutation NotchMondayWriteProbe($boardId: ID!, $groupId: String!, $itemName: String!) {
          create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
            id
          }
        }
      `,
      { boardId: board.boardId, groupId, itemName: '__notch_write_check__' }
    )
    const itemId = created.create_item?.id
    if (!itemId) return false

    try {
      await mondayApiWithToken(
        apiToken,
        `mutation NotchMondayWriteProbeDelete($itemId: ID!) { delete_item(item_id: $itemId) { id } }`,
        { itemId }
      )
    } catch {
      // Probe succeeded; cleanup is best-effort (delete the row in Monday if it remains).
    }
    return true
  } catch {
    return false
  }
}

export function mondayHasWriteAccess(): boolean {
  const token = getMondayToken()
  return token?.writeAccess !== false
}

function getMondayToken(): MondayToken | null {
  const token = getToken('monday') as MondayToken | undefined
  const apiToken = token?.apiToken as string | undefined
  if (!apiToken) return null
  return token
}

async function mondayApi<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const auth = getMondayToken()
  if (!auth) throw new Error('Monday not connected')
  return mondayApiWithToken<T>(auth.apiToken, query, variables)
}

async function mondayApiWithToken<T>(
  apiToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiToken,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25_000)
  })
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '))
  }
  if (!res.ok || json.data == null) {
    const err = json.errors?.[0]?.message ?? `Monday API error (${res.status})`
    throw new Error(err)
  }
  return json.data
}

export async function connectMondayWithToken(apiToken: string): Promise<void> {
  const me = await mondayApiWithToken<{
    me: { id: string; name?: string; email?: string }
  }>(
    apiToken,
    `
      query NotchMondayMe {
        me {
          id
          name
          email
        }
      }
    `
  )
  if (!me.me?.id) throw new Error('Unable to resolve Monday user from token')
  const writeAccess = await probeMondayWriteAccess(apiToken)
  setToken('monday', {
    apiToken,
    userId: me.me.id,
    userName: me.me.name ?? '',
    userEmail: me.me.email ?? '',
    lastSyncMs: Date.now() - FEED_HISTORY_MS,
    writeAccess
  })
  setConnection('monday', true)
}

export async function fetchMondayUpdates(
  limit = 30,
  sinceMs?: number,
  backfill = false
): Promise<StreamItem[]> {
  const auth = getMondayToken()
  if (!auth) return []
  const viewerId = auth.userId ?? ''
  const viewerName = auth.userName ?? ''
  const viewerEmail = auth.userEmail ?? ''
  const lastSyncMs = sinceMs ?? auth.lastSyncMs ?? Date.now() - FEED_HISTORY_MS

  const data = await mondayApi<{
    boards: {
      id: string
      name: string
      items_page: {
        items: {
          id: string
          name: string
          updated_at: string
          column_values: {
            id: string
            type?: string
            text?: string
            value?: string | null
          }[]
          updates: {
            id: string
            body: string
            text_body?: string
            created_at: string
            creator?: { id?: string; name?: string }
          }[]
        }[]
      }
    }[]
  }>(
    `
      query NotchBoardUpdates($boards: Int!, $items: Int!, $updates: Int!) {
        boards(limit: $boards) {
          id
          name
          items_page(limit: $items) {
            items {
              id
            name
              updated_at
              column_values {
                id
                type
                text
                value
              }
              updates(limit: $updates) {
                id
                body
                text_body
                created_at
                creator {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `,
    {
      boards: 8,
      items: backfill ? 50 : 30,
      updates: backfill ? 20 : 8
    }
  )

  const events: StreamItem[] = []
  const rawMatches: {
    relevance: number
    updateId: string
    body: string
    creatorName: string
    createdAt: string
    boardName: string
    boardId: string
    accountSlug: string
    itemName: string
    itemId: string
  }[] = []
  const rawRecent: {
    relevance: number
    updateId: string
    body: string
    creatorName: string
    createdAt: string
    boardName: string
    boardId: string
    accountSlug: string
    itemName: string
    itemId: string
  }[] = []
  const itemChanges: {
    relevance: number
    id: string
    title: string
    body: string
    createdAt: string
    boardName: string
    boardId: string
    accountSlug: string
    itemName: string
    itemId: string
  }[] = []

  for (const board of data.boards ?? []) {
    for (const item of board.items_page?.items ?? []) {
      const updatedAtMs = new Date(item.updated_at).getTime()
      const owners = item.column_values
        .map((c) => `${c.text ?? ''} ${c.value ?? ''}`.toLowerCase())
        .join(' ')
      const assignedToMe =
        (viewerId && owners.includes(viewerId.toLowerCase())) ||
        (viewerName && owners.includes(viewerName.toLowerCase())) ||
        (viewerEmail && owners.includes(viewerEmail.toLowerCase()))

      if (Number.isFinite(updatedAtMs) && updatedAtMs > lastSyncMs) {
        const statusLike = item.column_values
          .filter((c) => (c.id ?? '').toLowerCase().includes('status') || c.type === 'status')
          .map((c) => c.text?.trim())
          .filter(Boolean)
          .join(' · ')
        itemChanges.push({
          relevance: assignedToMe ? 3 : 1,
          id: `item-${item.id}-${updatedAtMs}`,
          title: `Item moved · ${item.name}`,
          body: statusLike
            ? `Status changed on ${item.name}: ${statusLike}`
            : `Item updated on board ${board.name}: ${item.name}`,
          createdAt: item.updated_at,
          boardName: board.name,
          boardId: board.id,
          accountSlug: '',
          itemName: item.name,
          itemId: item.id
        })
      }

      for (const update of item.updates ?? []) {
        const text = (update.text_body ?? update.body ?? '').trim()
        if (!text) continue
        const lower = text.toLowerCase()
        const mentionedMe =
          (viewerName && lower.includes(viewerName.toLowerCase())) ||
          (viewerEmail && lower.includes(viewerEmail.toLowerCase())) ||
          /@\w+/.test(lower)
        const mine = viewerId && update.creator?.id === viewerId
        const relevance = (assignedToMe ? 3 : 0) + (mentionedMe ? 2 : 0) + (mine ? 1 : 0)
        const candidate = {
          relevance,
          updateId: update.id,
          body: text,
          creatorName: update.creator?.name ?? 'Monday User',
          createdAt: update.created_at,
          boardName: board.name,
          boardId: board.id,
          accountSlug: '',
          itemName: item.name,
          itemId: item.id
        }
        const createdAtMs = new Date(update.created_at).getTime()
        if (Number.isFinite(createdAtMs) && createdAtMs > lastSyncMs) {
          rawRecent.push(candidate)
        }
        if (!assignedToMe && !mentionedMe && !mine) continue
        if (Number.isFinite(createdAtMs) && createdAtMs > lastSyncMs) {
          rawMatches.push(candidate)
        }
      }
    }
  }

  const selected = rawMatches.length > 0 ? rawMatches : rawRecent

  selected
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, limit)
    .forEach((m) => {
      events.push(
        normalizeMondayUpdate({
          id: m.updateId,
          title: `Monday · ${m.itemName}`,
          body: m.body,
          user: { name: m.creatorName },
          boardName: m.boardName,
          createdAt: m.createdAt,
          metadata: {
            itemId: m.itemId,
            itemName: m.itemName,
            boardName: m.boardName,
            boardId: m.boardId,
            accountSlug: m.accountSlug,
            relevance: m.relevance,
            viewer: viewerName || viewerEmail || 'me'
          }
        })
      )
    })

  itemChanges
    .sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, limit)
    .forEach((m) => {
      events.push(
        normalizeMondayUpdate({
          id: m.id,
          title: m.title,
          body: m.body,
          user: { name: 'Monday' },
          boardName: m.boardName,
          createdAt: m.createdAt,
          metadata: {
            itemId: m.itemId,
            itemName: m.itemName,
            boardName: m.boardName,
            boardId: m.boardId,
            accountSlug: m.accountSlug,
            relevance: m.relevance,
            type: 'item_status_change'
          }
        })
      )
    })

  return events
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit)
}

export async function syncMonday(io?: SocketServer): Promise<StreamItem[]> {
  if (!getMondayToken()) return []
  try {
    const auth = getMondayToken()!
    const needsBackfill = auth.feedBackfilledAt == null
    const sinceMs = needsBackfill
      ? Date.now() - FEED_HISTORY_MS
      : (auth.lastSyncMs ?? Date.now() - FEED_HISTORY_MS)
    const items = await fetchMondayUpdates(needsBackfill ? 80 : 30, sinceMs, needsBackfill)
    const newItems = items.filter((i) => !itemExists(i.id))
    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)
    const existing = getToken('monday') ?? {}
    setToken('monday', {
      ...existing,
      lastSyncMs: Date.now(),
      ...(needsBackfill ? { feedBackfilledAt: Date.now() } : {})
    })
    return items
  } catch (err) {
    console.error('[monday] sync failed:', err)
    return []
  }
}

export function isMondayConfigured(): boolean {
  return true
}

export function isMondayConnected(): boolean {
  return !!getMondayToken()
}

export async function getMondayAccount(): Promise<MondayAccount | null> {
  const auth = getMondayToken()
  if (!auth) return null

  if (auth.userId && (auth.userName || auth.userEmail)) {
    return {
      id: auth.userId,
      name: auth.userName ?? '',
      email: auth.userEmail ?? ''
    }
  }

  try {
    const me = await mondayApiWithToken<{
      me: { id: string; name?: string; email?: string }
    }>(
      auth.apiToken,
      `
        query NotchMondayMe {
          me { id name email }
        }
      `
    )
    if (!me.me?.id) return null
    const next = {
      apiToken: auth.apiToken,
      userId: me.me.id,
      userName: me.me.name ?? '',
      userEmail: me.me.email ?? '',
      lastSyncMs: auth.lastSyncMs
    }
    setToken('monday', next)
    return {
      id: me.me.id,
      name: me.me.name ?? '',
      email: me.me.email ?? ''
    }
  } catch {
    return auth.userId
      ? { id: auth.userId, name: auth.userName ?? '', email: auth.userEmail ?? '' }
      : null
  }
}

type StatusColumnSettings = {
  labels?: Record<string, string>
}

function parseStatusOptions(settingsStr?: string | null): { index: number; label: string }[] {
  if (!settingsStr) return []
  try {
    const parsed = JSON.parse(settingsStr) as StatusColumnSettings
    const labels = parsed.labels ?? {}
    return Object.entries(labels)
      .map(([index, label]) => ({ index: Number(index), label: String(label) }))
      .filter((o) => Number.isFinite(o.index) && o.label.trim())
      .sort((a, b) => a.index - b.index)
  } catch {
    return []
  }
}

export type MondayItemContext = {
  itemId: string
  itemTitle: string
  boardId: string
  boardName: string
  statusColumnId?: string
  currentStatus?: string
  statusOptions: { index: number; label: string }[]
  updates: {
    id: string
    body: string
    createdAt: string
    creatorName: string
  }[]
}

export async function getMondayItemContext(itemId: string): Promise<MondayItemContext | null> {
  if (!getMondayToken()) return null

  const data = await mondayApi<{
    items: {
      id: string
      name: string
      board: {
        id: string
        name: string
        columns: { id: string; title?: string; type?: string; settings_str?: string | null }[]
      } | null
      column_values: { id: string; type?: string; text?: string | null }[]
      updates: {
        id: string
        body: string
        text_body?: string
        created_at: string
        creator?: { name?: string }
      }[]
    }[]
  }>(
    `
      query NotchItemContext($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          name
          board {
            id
            name
            columns {
              id
              title
              type
              settings_str
            }
          }
          column_values {
            id
            type
            text
          }
          updates(limit: 50) {
            id
            body
            text_body
            created_at
            creator {
              name
            }
          }
        }
      }
    `,
    { itemId: [itemId] }
  )

  const item = data.items?.[0]
  if (!item?.board) return null

  const statusColumn =
    item.board.columns.find((c) => c.type === 'status') ??
    item.board.columns.find((c) => (c.title ?? '').toLowerCase() === 'status') ??
    item.board.columns.find((c) => (c.id ?? '').toLowerCase().includes('status'))

  const statusValue = statusColumn
    ? item.column_values.find((c) => c.id === statusColumn.id)
    : undefined

  return {
    itemId: item.id,
    itemTitle: item.name,
    boardId: item.board.id,
    boardName: item.board.name,
    statusColumnId: statusColumn?.id,
    currentStatus: statusValue?.text ?? undefined,
    statusOptions: parseStatusOptions(statusColumn?.settings_str),
    updates: (item.updates ?? []).map((u) => ({
      id: u.id,
      body: (u.text_body ?? u.body ?? '').trim(),
      createdAt: u.created_at,
      creatorName: u.creator?.name ?? 'Monday User'
    }))
  }
}

export async function createMondayComment(itemId: string, body: string): Promise<{ id: string }> {
  const text = body.trim()
  if (!text) throw new Error('Comment cannot be empty')

  const data = await mondayApi<{ create_update: { id: string } }>(
    `
      mutation NotchCreateUpdate($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `,
    { itemId, body: text }
  )

  if (!data.create_update?.id) throw new Error('Monday did not return update id')
  return data.create_update
}

export async function moveMondayItemStatus(
  boardId: string,
  itemId: string,
  columnId: string,
  statusIndex: number
): Promise<void> {
  await mondayApi<{ change_column_value: { id: string } }>(
    `
      mutation NotchMoveStatus($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
        }
      }
    `,
    {
      boardId,
      itemId,
      columnId,
      value: JSON.stringify({ index: statusIndex })
    }
  )
}

export type MondayBoardTarget = {
  boardId: string
  boardName: string
  groupId?: string
  groupTitle?: string
}

export type MondayBoardCatalogEntry = {
  boardId: string
  boardName: string
  groups: { id: string; title: string }[]
}

const CREATE_BOARD_PREFER = ['fde', 'development kanban', 'dev kanban', 'tasks']
const CREATE_GROUP_PREFER = ['to-do', 'to do', 'todo', 'new ideas', 'new features', 'backlog', 'open', 'planned', 'in progress']
const CREATE_GROUP_AVOID = ['completed', 'done', 'archive', 'archived', 'closed', 'won', 'lost']

function pickCreateGroup(groups: { id: string; title: string }[]): { id: string; title: string } | undefined {
  if (groups.length === 0) return undefined

  for (const label of CREATE_GROUP_PREFER) {
    const hit = groups.find((g) => {
      const t = g.title.toLowerCase()
      return (t === label || t.includes(label)) && !CREATE_GROUP_AVOID.some((a) => t.includes(a))
    })
    if (hit) return hit
  }

  return (
    groups.find((g) => !CREATE_GROUP_AVOID.some((a) => g.title.toLowerCase().includes(a))) ?? groups[0]
  )
}

function isSubitemsBoard(name: string): boolean {
  return /\bsubitems?\s+of\b/i.test(name)
}

function resolveDefaultCreateBoard(
  boards: MondayBoardTarget[],
  token: MondayToken | null
): MondayBoardTarget {
  const eligible = boards.filter((b) => !isSubitemsBoard(b.boardName))

  if (token?.defaultBoardId) {
    const saved = eligible.find((b) => b.boardId === token.defaultBoardId)
    if (saved) return saved
  }

  for (const label of CREATE_BOARD_PREFER) {
    const hit =
      eligible.find((b) => b.boardName.toLowerCase() === label) ??
      eligible.find((b) => b.boardName.toLowerCase().includes(label))
    if (hit) return hit
  }

  return eligible[0] ?? boards[0]
}

function persistMondayCreateDefaults(board: MondayBoardTarget): void {
  const token = getMondayToken()
  if (!token) return
  if (
    token.defaultBoardId === board.boardId &&
    token.defaultGroupId === board.groupId
  ) {
    return
  }
  setToken('monday', {
    ...token,
    defaultBoardId: board.boardId,
    defaultBoardName: board.boardName,
    defaultGroupId: board.groupId,
    defaultGroupTitle: board.groupTitle
  })
}

export async function listMondayBoardCatalog(): Promise<MondayBoardCatalogEntry[]> {
  if (!getMondayToken()) return []

  const data = await mondayApi<{
    boards: { id: string; name: string; groups: { id: string; title: string }[] }[]
  }>(
    `
      query NotchBoardCatalog {
        boards(limit: 50) {
          id
          name
          groups {
            id
            title
          }
        }
      }
    `
  )

  return (data.boards ?? []).map((board) => ({
    boardId: board.id,
    boardName: board.name,
    groups: board.groups ?? []
  }))
}

export async function listMondayBoardTargets(): Promise<MondayBoardTarget[]> {
  const catalog = await listMondayBoardCatalog()
  return catalog.map((board) => {
    const group = pickCreateGroup(board.groups)
    return {
      boardId: board.boardId,
      boardName: board.boardName,
      groupId: group?.id,
      groupTitle: group?.title
    }
  })
}

export async function getMondayCreateTarget(): Promise<MondayBoardTarget | null> {
  const boards = await listMondayBoardTargets()
  if (boards.length === 0) return null
  const board = resolveDefaultCreateBoard(boards, getMondayToken())
  persistMondayCreateDefaults(board)
  return board
}

export async function createMondayItem(input: {
  boardId: string
  groupId?: string
  name: string
}): Promise<{ id: string; boardId: string; boardName: string }> {
  const title = input.name.trim().slice(0, 255)
  if (!title) throw new Error('Task name cannot be empty')

  const catalog = await listMondayBoardCatalog()
  const boardEntry = catalog.find((b) => b.boardId === input.boardId)
  const groupCandidates: string[] = []

  for (const id of [input.groupId, boardEntry ? pickCreateGroup(boardEntry.groups)?.id : undefined]) {
    if (id && !groupCandidates.includes(id)) groupCandidates.push(id)
  }
  if (boardEntry) {
    for (const group of boardEntry.groups) {
      if (!groupCandidates.includes(group.id)) groupCandidates.push(group.id)
    }
  }

  let lastError = 'Monday did not return item id — check board permissions and default group in Integrations'

  for (let i = 0; i <= groupCandidates.length; i += 1) {
    const groupId = i < groupCandidates.length ? groupCandidates[i] : undefined
    try {
      const data = groupId
        ? await mondayApi<{ create_item: { id: string } | null }>(
            `
              mutation NotchCreateItem($boardId: ID!, $groupId: String!, $itemName: String!) {
                create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
                  id
                }
              }
            `,
            { boardId: input.boardId, groupId, itemName: title }
          )
        : await mondayApi<{ create_item: { id: string } | null }>(
            `
              mutation NotchCreateItem($boardId: ID!, $itemName: String!) {
                create_item(board_id: $boardId, item_name: $itemName) {
                  id
                }
              }
            `,
            { boardId: input.boardId, itemName: title }
          )

      if (data.create_item?.id) {
        const boards = await listMondayBoardTargets()
        const board = boards.find((b) => b.boardId === input.boardId)
        return {
          id: data.create_item.id,
          boardId: input.boardId,
          boardName: board?.boardName ?? boardEntry?.boardName ?? 'Monday board'
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  throw new Error(formatMondayWriteError(lastError))
}

export async function createMondayItemOnBoard(input: {
  name: string
  boardName?: string
}): Promise<{ id: string; boardId: string; boardName: string; groupTitle?: string }> {
  const catalog = await listMondayBoardCatalog()
  if (catalog.length === 0) throw new Error('No Monday boards available')

  const targets: MondayBoardTarget[] = catalog.map((board) => {
    const group = pickCreateGroup(board.groups)
    return {
      boardId: board.boardId,
      boardName: board.boardName,
      groupId: group?.id,
      groupTitle: group?.title
    }
  })

  const needle = input.boardName?.trim().toLowerCase()
  const board = needle
    ? targets.find((b) => b.boardName.toLowerCase() === needle) ??
      targets.find((b) => b.boardName.toLowerCase().includes(needle))
    : resolveDefaultCreateBoard(targets, getMondayToken())

  if (!board) throw new Error('Monday board not found')

  if (!needle) persistMondayCreateDefaults(board)

  const created = await createMondayItem({
    boardId: board.boardId,
    groupId: board.groupId,
    name: input.name
  })

  return { ...created, boardName: board.boardName, groupTitle: board.groupTitle }
}
