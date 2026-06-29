import type { ConnectorImpl, ConnectorSettings } from './types'

// Jira Cloud REST API v3 — auth: email + API token (Basic auth)
function jiraHeaders(email: string, apiToken: string) {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64')
  return {
    Authorization: `Basic ${encoded}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function jiraGet(workspaceUrl: string, email: string, apiToken: string, path: string): Promise<Record<string, unknown>> {
  const base = workspaceUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/rest/api/3${path}`, { headers: jiraHeaders(email, apiToken) })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 10000))
    return jiraGet(workspaceUrl, email, apiToken, path)
  }
  if (!res.ok) throw new Error(`Jira ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return ''
  const node = adf as { type?: string; text?: string; content?: unknown[] }
  if (node.type === 'text') return node.text ?? ''
  if (node.content) return node.content.map(adfToText).join(node.type === 'paragraph' ? '\n' : ' ')
  return ''
}

export const jiraConnector: ConnectorImpl = {
  type: 'jira',
  label: 'Jira',
  description: 'Indexes bugs, features, and epics from your Jira projects to track product gaps.',
  authType: 'api_key',

  async validate(creds) {
    try {
      const { workspaceUrl, email, apiKey } = creds as typeof creds & { email?: string }
      if (!workspaceUrl || !email || !apiKey) return { ok: false, error: 'Missing workspaceUrl, email, or apiKey' }
      await jiraGet(workspaceUrl, email, apiKey, '/myself')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const { workspaceUrl, apiKey } = creds as typeof creds & { email?: string }
    const email = (creds as unknown as Record<string, string>).email ?? ''
    if (!workspaceUrl || !email || !apiKey) return

    const sinceDate = since
      ? new Date(since).toISOString().split('T')[0]
      : new Date(Date.now() - 180 * 86400000).toISOString().split('T')[0]

    const projectKeys = (settings as ConnectorSettings & { projectKeys?: string[] }).projectKeys ?? []

    const projectFilter = projectKeys.length > 0
      ? `project in (${projectKeys.map(k => `"${k}"`).join(',')}) AND `
      : ''

    const jql = `${projectFilter}issuetype in (Bug, Story, Epic, "Feature Request", Improvement) AND updated >= "${sinceDate}" ORDER BY updated DESC`

    const base = (workspaceUrl ?? '').replace(/\/$/, '')
    let startAt = 0
    const maxResults = 50

    while (true) {
      const data = await jiraGet(workspaceUrl!, email, apiKey!, `/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,issuetype,status,labels,priority,comment,assignee,created,updated`)

      const issues = (data.issues ?? []) as Array<{
        id: string; key: string
        fields: {
          summary: string
          description: unknown
          issuetype: { name: string }
          status: { name: string }
          labels: string[]
          priority?: { name: string }
          created: string; updated: string
          assignee?: { displayName: string }
          comment?: { comments: Array<{ body: unknown; author: { displayName: string }; created: string }> }
        }
      }>

      if (issues.length === 0) break

      for (const issue of issues) {
        const { fields } = issue
        const descText = adfToText(fields.description).trim()
        if (!descText && !fields.summary) continue

        const parts: string[] = [
          `[Jira ${issue.key}] ${fields.summary}`,
          `Type: ${fields.issuetype.name} | Status: ${fields.status.name}${fields.priority ? ` | Priority: ${fields.priority.name}` : ''}`,
        ]
        if (fields.labels?.length > 0) parts.push(`Labels: ${fields.labels.join(', ')}`)
        if (descText.length > 20) parts.push('', descText)

        const comments = fields.comment?.comments ?? []
        if (comments.length > 0) {
          parts.push('\nComments:')
          for (const c of comments.slice(0, 8)) {
            const text = adfToText(c.body).trim()
            if (text.length > 20) parts.push(`  [${c.author.displayName}]: ${text}`)
          }
        }

        const content = parts.join('\n').trim()
        if (content.length < 60) continue

        yield {
          content,
          sourceId: `jira-${issue.key}`,
          sourceUrl: `${base}/browse/${issue.key}`,
          title: fields.summary,
          timestamp: new Date(fields.updated).getTime(),
          contentType: 'issue' as const,
        }
      }

      startAt += issues.length
      const total = Number(data.total ?? 0)
      if (startAt >= total) break
    }
  },
}
