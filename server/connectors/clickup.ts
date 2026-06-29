import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// ClickUp — REST API v2 with API key
// Extracts: tasks with descriptions, comments from specified spaces/lists

const BASE = 'https://api.clickup.com/api/v2'

async function cuFetch(path: string, apiKey: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: apiKey },
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000))
    return cuFetch(path, apiKey)
  }
  if (!res.ok) throw new Error(`ClickUp API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const clickupConnector: ConnectorImpl = {
  type: 'clickup',
  label: 'ClickUp',
  description: 'Syncs tasks and comments from specified spaces or lists',
  authType: 'api_key',

  async validate(creds) {
    try {
      await cuFetch('/user', creds.apiKey ?? '')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const key = creds.apiKey ?? ''
    const listIds: string[] = settings.listIds ?? []

    // If no list IDs, discover from teams → spaces → lists
    let targetListIds = listIds
    if (targetListIds.length === 0) {
      const teams = await cuFetch('/team', key) as { teams: { id: string }[] }
      for (const team of teams.teams.slice(0, 3)) {
        const spaces = await cuFetch(`/team/${team.id}/space`, key) as { spaces: { id: string }[] }
        for (const space of spaces.spaces.slice(0, 5)) {
          const lists = await cuFetch(`/space/${space.id}/list`, key) as { lists: { id: string }[] }
          targetListIds.push(...lists.lists.slice(0, 10).map(l => l.id))
        }
      }
    }

    const sinceMs = since ?? 0

    for (const listId of targetListIds.slice(0, 20)) {
      let page = 0
      let hasMore = true
      while (hasMore) {
        const data = await cuFetch(
          `/list/${listId}/task?page=${page}&include_closed=true&date_updated_gt=${sinceMs}&subtasks=true`,
          key
        ) as {
          tasks: Array<{ id: string; name: string; description: string; date_updated: string; url: string }>
          last_page: boolean
        }
        hasMore = !data.last_page
        page++

        for (const task of data.tasks ?? []) {
          // Fetch comments
          const commentsData = await cuFetch(`/task/${task.id}/comment`, key) as {
            comments: Array<{ comment_text: string; user: { username: string } }>
          }
          const comments = (commentsData.comments ?? [])
            .filter(c => c.comment_text?.length > 20)
            .map(c => `${c.user.username}: ${c.comment_text}`)
            .join('\n')

          const content = [
            `Task: ${task.name}`,
            task.description ? `Description: ${task.description}` : '',
            comments ? `Comments:\n${comments}` : '',
          ].filter(Boolean).join('\n\n')

          if (content.length < 80) continue

          yield {
            content,
            sourceId: `clickup-task-${task.id}`,
            sourceUrl: task.url,
            title: task.name,
            timestamp: Number(task.date_updated),
            contentType: 'issue',
          } satisfies ConnectorChunk
        }
      }
    }
  },
}
