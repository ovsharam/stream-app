import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Readme.com — API v2 with API key
// Extracts: docs pages, API reference descriptions, changelogs

const BASE = 'https://dash.readme.com/api/v1'

async function rmFetch(path: string, apiKey: string) {
  const creds = Buffer.from(`${apiKey}:`).toString('base64')
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Basic ${creds}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Readme API ${res.status}: ${await res.text()}`)
  return res.json()
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '')        // inline code
    .replace(/#{1,6}\s/g, '')       // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[*_~]/g, '')          // formatting
    .replace(/\s+/g, ' ')
    .trim()
}

export const readmeConnector: ConnectorImpl = {
  type: 'readme',
  label: 'Readme.com',
  description: 'Syncs product documentation, API reference, and changelog from Readme',
  authType: 'api_key',

  async validate(creds) {
    try {
      await rmFetch('/version', creds.apiKey ?? '')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const key = creds.apiKey ?? ''

    // Get all versions
    const versions = await rmFetch('/version', key) as Array<{ version: string; is_stable: boolean }>
    const stableVersion = versions.find(v => v.is_stable)?.version ?? versions[0]?.version
    if (!stableVersion) return

    // Fetch docs categories
    const categories = await rmFetch(`/categories?perPage=50&page=1`, key) as Array<{ slug: string; title: string }>

    for (const cat of categories) {
      const docs = await rmFetch(`/categories/${cat.slug}/docs`, key) as Array<{ slug: string; title: string; updatedAt?: string }>

      for (const doc of docs) {
        const updatedMs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0
        if (since && updatedMs && updatedMs < since) continue

        try {
          const page = await rmFetch(`/docs/${doc.slug}`, key) as {
            title: string; body: string; slug: string; updatedAt: string
          }

          const text = stripMarkdown(page.body)
          if (text.length < 100) continue

          yield {
            content: `Doc: ${page.title}\nCategory: ${cat.title}\n\n${text}`,
            sourceId: `readme-doc-${doc.slug}`,
            sourceUrl: `https://docs.readme.com/${doc.slug}`,
            title: page.title,
            timestamp: new Date(page.updatedAt).getTime(),
            contentType: 'doc',
          } satisfies ConnectorChunk
        } catch {
          // skip
        }
      }
    }

    // Fetch changelog entries
    let page = 1
    let hasMore = true
    while (hasMore) {
      const entries = await rmFetch(`/changelogs?perPage=20&page=${page}`, key) as Array<{
        title: string; body: string; slug: string; createdAt: string; updatedAt: string
      }>
      hasMore = entries.length === 20
      page++

      for (const entry of entries) {
        const updatedMs = new Date(entry.updatedAt).getTime()
        if (since && updatedMs < since) { hasMore = false; break }

        const text = stripMarkdown(entry.body)
        if (text.length < 50) continue

        yield {
          content: `Changelog: ${entry.title}\n\n${text}`,
          sourceId: `readme-changelog-${entry.slug}`,
          sourceUrl: `https://readme.com/changelog/${entry.slug}`,
          title: entry.title,
          timestamp: updatedMs,
          contentType: 'doc',
        } satisfies ConnectorChunk
      }
    }
  },
}
