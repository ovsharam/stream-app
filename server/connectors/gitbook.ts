import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// GitBook — REST API v1 with API token
// Extracts: pages from selected spaces/collections

const BASE = 'https://api.gitbook.com/v1'

async function gbFetch(path: string, token: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GitBook API ${res.status}: ${await res.text()}`)
  return res.json()
}

function extractText(document: Record<string, unknown>): string {
  if (!document?.document) return ''
  function walk(node: Record<string, unknown>): string {
    if (node.object === 'text') return String(node.leaves ? (node.leaves as { text: string }[])[0]?.text ?? '' : '')
    if (Array.isArray(node.nodes)) return (node.nodes as Record<string, unknown>[]).map(walk).join(' ')
    return ''
  }
  return walk(document.document as Record<string, unknown>).replace(/\s+/g, ' ').trim()
}

export const gitbookConnector: ConnectorImpl = {
  type: 'gitbook',
  label: 'GitBook',
  description: 'Syncs documentation pages from GitBook spaces',
  authType: 'api_key',

  async validate(creds) {
    try {
      await gbFetch('/user', creds.apiKey ?? '')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.apiKey ?? ''
    const spaceIds: string[] = settings.spaceIds ?? []

    // Discover spaces if none given
    let targetSpaceIds = spaceIds
    if (targetSpaceIds.length === 0) {
      const data = await gbFetch('/orgs', token) as { items: { id: string }[] }
      for (const org of data.items ?? []) {
        const spaces = await gbFetch(`/orgs/${org.id}/spaces`, token) as { items: { id: string }[] }
        targetSpaceIds.push(...(spaces.items ?? []).map(s => s.id))
      }
    }

    for (const spaceId of targetSpaceIds) {
      // Get all pages in space
      const pages = await gbFetch(`/spaces/${spaceId}/content/page`, token) as {
        pages: Array<{ id: string; title: string; path: string; updatedAt?: string; urls: { app: string } }>
      }

      for (const page of pages.pages ?? []) {
        const updatedMs = page.updatedAt ? new Date(page.updatedAt).getTime() : 0
        if (since && updatedMs && updatedMs < since) continue

        try {
          const content = await gbFetch(`/spaces/${spaceId}/content/page/${page.id}`, token) as {
            document: Record<string, unknown>
            markdown?: string
          }

          // Prefer markdown if available, fall back to document extraction
          const text = content.markdown
            ? content.markdown.replace(/[#*`\[\]]/g, '').replace(/\s+/g, ' ').trim()
            : extractText(content)

          if (text.length < 100) continue

          yield {
            content: `Page: ${page.title}\n\n${text}`,
            sourceId: `gitbook-page-${page.id}`,
            sourceUrl: page.urls.app,
            title: page.title,
            timestamp: updatedMs || Date.now(),
            contentType: 'doc',
          } satisfies ConnectorChunk
        } catch {
          // Skip pages that 404 or have no content
        }
      }
    }
  },
}
