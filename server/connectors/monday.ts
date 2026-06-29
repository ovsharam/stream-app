import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Monday.com — GraphQL API with API key
// Extracts: board items (tasks/features/bugs) with updates (comments)

const API = 'https://api.monday.com/v2'

async function gql(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday API ${res.status}: ${await res.text()}`)
  const json = await res.json() as { data?: unknown; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data
}

export const mondayConnector: ConnectorImpl = {
  type: 'monday',
  label: 'Monday.com',
  description: 'Syncs board items, sub-items, and update threads from selected boards',
  authType: 'api_key',

  async validate(creds) {
    try {
      await gql(creds.apiKey!, '{ me { id name } }')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const boardIds: string[] = settings.boardIds ?? []

    // If no board IDs specified, fetch first 20 boards
    let targetBoardIds = boardIds
    if (targetBoardIds.length === 0) {
      const data = await gql(creds.apiKey!, '{ boards(limit:20, order_by:created_at) { id name } }') as { boards: { id: string; name: string }[] }
      targetBoardIds = data.boards.map(b => b.id)
    }

    for (const boardId of targetBoardIds) {
      let cursor: string | null = null
      do {
        const q = `query($boardId: ID!, $cursor: String) {
          boards(ids: [$boardId]) {
            name
            items_page(limit: 50, cursor: $cursor) {
              cursor
              items {
                id name
                created_at updated_at
                column_values { text }
                updates(limit: 10) { id text_body created_at creator { name } }
              }
            }
          }
        }`
        const data = await gql(creds.apiKey!, q, { boardId, cursor }) as {
          boards: Array<{
            name: string
            items_page: {
              cursor: string | null
              items: Array<{
                id: string; name: string
                created_at: string; updated_at: string
                column_values: { text: string }[]
                updates: Array<{ id: string; text_body: string; created_at: string; creator: { name: string } }>
              }>
            }
          }>
        }
        const board = data.boards[0]
        cursor = board.items_page.cursor

        for (const item of board.items_page.items) {
          const updatedMs = new Date(item.updated_at).getTime()
          if (since && updatedMs < since) continue

          const colText = item.column_values.map(c => c.text).filter(Boolean).join(' | ')
          const updatesText = item.updates
            .map(u => `${u.creator.name}: ${u.text_body}`)
            .filter(u => u.length > 20)
            .join('\n')

          const content = [
            `Board: ${board.name}`,
            `Item: ${item.name}`,
            colText ? `Details: ${colText}` : '',
            updatesText ? `Updates:\n${updatesText}` : '',
          ].filter(Boolean).join('\n')

          if (content.length < 80) continue

          yield {
            content,
            sourceId: `monday-item-${item.id}`,
            sourceUrl: `https://monday.com/boards/${boardId}/pulses/${item.id}`,
            title: item.name,
            timestamp: updatedMs,
            contentType: 'issue',
          } satisfies ConnectorChunk
        }
      } while (cursor)
    }
  },
}
