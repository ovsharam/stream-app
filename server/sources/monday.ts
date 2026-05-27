import type { Server as SocketServer } from 'socket.io'
import { normalizeMondayUpdate } from '../normalizer'
import { upsertItem, itemExists } from '../db'
import { getToken, setToken, setConnection } from '../store'
import type { StreamItem } from '../../shared/types'
import type { MondayAccount } from '../../shared/cluster'

type MondayToken = {
  apiToken: string
  userId?: string
  userName?: string
  userEmail?: string
  lastSyncMs?: number
  defaultBoardId?: string
  defaultBoardName?: string
  defaultGroupId?: string
  defaultGroupTitle?: string
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
      Authorization: apiToken
    },
    body: JSON.stringify({ query, variables })
  })
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (!res.ok || !json.data) {
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
  setToken('monday', {
    apiToken,
    userId: me.me.id,
    userName: me.me.name ?? '',
    userEmail: me.me.email ?? '',
    lastSyncMs: Date.now() - 1000 * 60 * 60 * 12
  })
  setConnection('monday', true)
}

export async function fetchMondayUpdates(limit = 30): Promise<StreamItem[]> {
  const auth = getMondayToken()
  if (!auth) return []
  const viewerId = auth.userId ?? ''
  const viewerName = auth.userName ?? ''
  const viewerEmail = auth.userEmail ?? ''
  const lastSyncMs = auth.lastSyncMs ?? Date.now() - 1000 * 60 * 60 * 6

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
      items: 30,
      updates: 8
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
    const items = await fetchMondayUpdates(30)
    const newItems = items.filter((i) => !itemExists(i.id))
    for (const item of items) upsertItem(item)
    for (const item of newItems) io?.emit('stream:item', item)
    const existing = getToken('monday') ?? {}
    setToken('monday', { ...existing, lastSyncMs: Date.now() })
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

const CREATE_GROUP_PREFER = ['new ideas', 'backlog', 'to do', 'todo', 'open', 'planned', 'in progress']
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

function resolveDefaultCreateBoard(
  boards: MondayBoardTarget[],
  token: MondayToken | null
): MondayBoardTarget {
  if (token?.defaultBoardId) {
    const saved = boards.find((b) => b.boardId === token.defaultBoardId)
    if (saved) return saved
  }

  const preferred =
    boards.find((b) => b.boardName.toLowerCase() === 'development kanban') ??
    boards.find((b) => b.boardName.toLowerCase().includes('development kanban')) ??
    boards.find((b) => b.boardName.toLowerCase().includes('dev kanban'))

  return preferred ?? boards[0]
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

export async function listMondayBoardTargets(): Promise<MondayBoardTarget[]> {
  if (!getMondayToken()) return []

  const data = await mondayApi<{
    boards: { id: string; name: string; groups: { id: string; title: string }[] }[]
  }>(
    `
      query NotchBoardTargets {
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

  return (data.boards ?? []).map((board) => {
    const group = pickCreateGroup(board.groups ?? [])
    return {
      boardId: board.id,
      boardName: board.name,
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
  const title = input.name.trim()
  if (!title) throw new Error('Task name cannot be empty')

  const data = await mondayApi<{ create_item: { id: string } }>(
    `
      mutation NotchCreateItem($boardId: ID!, $groupId: String, $itemName: String!) {
        create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
          id
        }
      }
    `,
    {
      boardId: input.boardId,
      groupId: input.groupId ?? null,
      itemName: title
    }
  )

  if (!data.create_item?.id) throw new Error('Monday did not return item id')

  const boards = await listMondayBoardTargets()
  const board = boards.find((b) => b.boardId === input.boardId)

  return {
    id: data.create_item.id,
    boardId: input.boardId,
    boardName: board?.boardName ?? 'Monday board'
  }
}

export async function createMondayItemOnBoard(input: {
  name: string
  boardName?: string
}): Promise<{ id: string; boardId: string; boardName: string; groupTitle?: string }> {
  const boards = await listMondayBoardTargets()
  if (boards.length === 0) throw new Error('No Monday boards available')

  const needle = input.boardName?.trim().toLowerCase()
  const board = needle
    ? boards.find((b) => b.boardName.toLowerCase() === needle) ??
      boards.find((b) => b.boardName.toLowerCase().includes(needle))
    : resolveDefaultCreateBoard(boards, getMondayToken())

  if (!board) throw new Error('Monday board not found')

  if (!needle) persistMondayCreateDefaults(board)

  const created = await createMondayItem({
    boardId: board.boardId,
    groupId: board.groupId,
    name: input.name
  })

  return { ...created, boardName: board.boardName, groupTitle: board.groupTitle }
}
