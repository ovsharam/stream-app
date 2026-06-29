import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Confluence — REST API v2 with email + API token (same as Jira)
// Extracts: pages from specified spaces, full text content

const BASE_V2 = 'https://api.atlassian.com/ex/confluence'

function cloudFetch(cloudId: string, path: string, email: string, token: string) {
  const creds = Buffer.from(`${email}:${token}`).toString('base64')
  return fetch(`${BASE_V2}/${cloudId}/wiki/api/v2${path}`, {
    headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
  })
}

// Fallback for self-hosted / direct cloud URL
function directFetch(baseUrl: string, path: string, email: string, token: string) {
  const creds = Buffer.from(`${email}:${token}`).toString('base64')
  const cleanBase = baseUrl.replace(/\/$/, '')
  return fetch(`${cleanBase}/wiki/rest/api${path}`, {
    headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
  })
}

function adfToText(node: Record<string, unknown>): string {
  if (!node) return ''
  if (node.type === 'text') return String(node.text ?? '')
  if (Array.isArray(node.content)) {
    return (node.content as Record<string, unknown>[]).map(adfToText).join(' ')
  }
  return ''
}

export const confluenceConnector: ConnectorImpl = {
  type: 'confluence',
  label: 'Confluence',
  description: 'Syncs pages from selected Confluence spaces for product documentation',
  authType: 'api_key',

  async validate(creds) {
    try {
      const url = creds.workspaceUrl?.replace(/\/$/, '') ?? ''
      const email = creds.email ?? ''
      const token = creds.apiKey ?? ''
      if (!url || !email || !token) return { ok: false, error: 'Provide workspaceUrl, email, and API token' }
      const res = await directFetch(url, '/space?limit=1', email, token)
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const baseUrl = creds.workspaceUrl?.replace(/\/$/, '') ?? ''
    const email = creds.email ?? ''
    const token = creds.apiKey ?? ''
    const spaceKeys: string[] = settings.spaceKeys ?? []

    // Discover spaces if none specified
    let targetSpaces = spaceKeys
    if (targetSpaces.length === 0) {
      const res = await directFetch(baseUrl, '/space?limit=25&type=global', email, token)
      const data = await res.json() as { results: { key: string }[] }
      targetSpaces = data.results.map(s => s.key)
    }

    for (const spaceKey of targetSpaces) {
      let start = 0
      const limit = 25
      let hasMore = true

      while (hasMore) {
        const sinceParam = since ? `&lastModified=${new Date(since).toISOString().slice(0, 10)}` : ''
        const res = await directFetch(
          baseUrl,
          `/content?spaceKey=${spaceKey}&type=page&expand=body.storage,version&limit=${limit}&start=${start}${sinceParam}`,
          email, token
        )
        if (!res.ok) break
        const data = await res.json() as {
          results: Array<{
            id: string; title: string
            body: { storage: { value: string } }
            version: { when: string }
            _links: { webui: string }
          }>
          _links?: { next?: string }
        }

        hasMore = !!data._links?.next
        start += limit

        for (const page of data.results ?? []) {
          const updatedMs = new Date(page.version.when).getTime()
          if (since && updatedMs < since) continue

          // Strip HTML tags from storage format
          const text = page.body.storage.value
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

          if (text.length < 100) continue

          yield {
            content: `Page: ${page.title}\n\n${text}`,
            sourceId: `confluence-page-${page.id}`,
            sourceUrl: `${baseUrl}/wiki${page._links.webui}`,
            title: page.title,
            timestamp: updatedMs,
            contentType: 'doc',
          } satisfies ConnectorChunk
        }
      }
    }
  },
}
