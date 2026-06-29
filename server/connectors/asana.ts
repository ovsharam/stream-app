import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Asana — REST API with personal access token
// Extracts: tasks with descriptions, subtasks, comments from specified projects

const BASE = 'https://app.asana.com/api/1.0'

async function asanaFetch(path: string, pat: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}` },
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000))
    return asanaFetch(path, pat)
  }
  if (!res.ok) throw new Error(`Asana API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const asanaConnector: ConnectorImpl = {
  type: 'asana',
  label: 'Asana',
  description: 'Syncs tasks, subtasks, and comments from selected projects',
  authType: 'pat',

  async validate(creds) {
    try {
      await asanaFetch('/users/me', creds.pat ?? creds.accessToken ?? '')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.pat ?? creds.accessToken ?? ''
    const projectIds: string[] = settings.projectIds ?? []

    let targetProjectIds = projectIds
    if (targetProjectIds.length === 0) {
      const ws = await asanaFetch('/workspaces?opt_fields=gid', token) as { data: { gid: string }[] }
      const workspaceId = ws.data[0]?.gid
      if (!workspaceId) return
      const projects = await asanaFetch(`/projects?workspace=${workspaceId}&opt_fields=gid,name&limit=50`, token) as { data: { gid: string; name: string }[] }
      targetProjectIds = projects.data.map(p => p.gid)
    }

    const sinceStr = since ? new Date(since).toISOString() : undefined

    for (const projectId of targetProjectIds) {
      let offset: string | undefined
      do {
        const url = `/tasks?project=${projectId}&opt_fields=gid,name,notes,modified_at,permalink_url,subtasks.gid&limit=50${offset ? `&offset=${offset}` : ''}${sinceStr ? `&modified_since=${sinceStr}` : ''}`
        const data = await asanaFetch(url, token) as {
          data: Array<{ gid: string; name: string; notes: string; modified_at: string; permalink_url: string; subtasks: { gid: string }[] }>
          next_page?: { offset: string }
        }
        offset = data.next_page?.offset

        for (const task of data.data) {
          // Fetch stories (comments)
          const stories = await asanaFetch(`/tasks/${task.gid}/stories?opt_fields=text,created_by.name,type&limit=20`, token) as {
            data: Array<{ text: string; created_by: { name: string }; type: string }>
          }
          const comments = stories.data
            .filter(s => s.type === 'comment' && s.text?.length > 20)
            .map(s => `${s.created_by.name}: ${s.text}`)
            .join('\n')

          const content = [
            `Task: ${task.name}`,
            task.notes ? `Description: ${task.notes}` : '',
            comments ? `Comments:\n${comments}` : '',
          ].filter(Boolean).join('\n\n')

          if (content.length < 80) continue

          yield {
            content,
            sourceId: `asana-task-${task.gid}`,
            sourceUrl: task.permalink_url,
            title: task.name,
            timestamp: new Date(task.modified_at).getTime(),
            contentType: 'issue',
          } satisfies ConnectorChunk
        }
      } while (offset)
    }
  },
}
