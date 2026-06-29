import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

const BASE = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

async function notionFetch(token: string, path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 10)
    await new Promise(r => setTimeout(r, retry * 1000))
    return notionFetch(token, path, method, body)
  }
  if (!res.ok) throw new Error(`Notion ${res.status}: ${path}`)
  return res.json() as Promise<Record<string, unknown>>
}

function extractText(blocks: Array<Record<string, unknown>>): string {
  const lines: string[] = []
  for (const block of blocks) {
    const type = block.type as string
    const content = block[type] as Record<string, unknown> | undefined
    if (!content) continue
    const richText = (content.rich_text ?? content.text) as Array<{ plain_text: string }> | undefined
    if (richText && richText.length > 0) {
      const text = richText.map(t => t.plain_text).join('')
      if (type === 'heading_1') lines.push(`\n# ${text}`)
      else if (type === 'heading_2') lines.push(`\n## ${text}`)
      else if (type === 'heading_3') lines.push(`\n### ${text}`)
      else if (type === 'bulleted_list_item') lines.push(`- ${text}`)
      else if (type === 'numbered_list_item') lines.push(`• ${text}`)
      else if (type === 'callout') lines.push(`> ${text}`)
      else if (type === 'code') lines.push(`\`\`\`\n${text}\n\`\`\``)
      else lines.push(text)
    }
  }
  return lines.join('\n').trim()
}

async function fetchPageText(token: string, pageId: string): Promise<string> {
  let text = ''
  let cursor: string | undefined
  do {
    const params = cursor ? `?start_cursor=${cursor}` : ''
    const data = await notionFetch(token, `/blocks/${pageId}/children${params}`)
    const results = (data.results ?? []) as Array<Record<string, unknown>>
    text += extractText(results) + '\n'
    cursor = data.has_more ? String(data.next_cursor ?? '') : undefined
  } while (cursor)
  return text
}

export const notionConnector: ConnectorImpl = {
  type: 'notion',
  label: 'Notion',
  description: 'Indexes product specs, PRDs, and documentation pages from your Notion workspace.',
  authType: 'oauth',

  getAuthUrl(clientId, redirectUri, state) {
    return `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`
  },

  async exchangeCode(code, clientId, clientSecret, redirectUri) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const res = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    })
    const data = await res.json() as Record<string, unknown>
    if (data.error) throw new Error(`Notion OAuth error: ${data.error}`)
    return { accessToken: String(data.access_token) }
  },

  async validate(creds) {
    try {
      await notionFetch(creds.accessToken ?? '', '/users/me')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const token = creds.accessToken ?? ''
    const sinceIso = since ? new Date(since).toISOString() : undefined

    // If specific page IDs configured, use those directly
    const targetPageIds = [...(settings.pageIds ?? []), ...(settings.databaseIds ?? [])]

    if (targetPageIds.length > 0) {
      for (const pageId of targetPageIds) {
        try {
          const meta = await notionFetch(token, `/pages/${pageId}`)
          const title = ((meta.properties as Record<string, Record<string, unknown>>)?.title?.title as Array<{ plain_text: string }> | undefined)
            ?.map(t => t.plain_text).join('') ?? pageId
          const text = await fetchPageText(token, pageId)
          if (text.length < 60) continue
          yield {
            content: text,
            sourceId: `notion-${pageId}`,
            sourceUrl: String(meta.url ?? ''),
            title,
            timestamp: meta.last_edited_time ? new Date(String(meta.last_edited_time)).getTime() : undefined,
            contentType: 'doc' as const,
          }
        } catch (e) {
          console.warn(`[notion] page error ${pageId}:`, (e as Error).message)
        }
      }
      return
    }

    // Otherwise search for recently edited pages
    let cursor: string | undefined
    do {
      const body: Record<string, unknown> = {
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      }
      if (cursor) body.start_cursor = cursor

      const data = await notionFetch(token, '/search', 'POST', body)
      const results = (data.results ?? []) as Array<Record<string, unknown>>
      cursor = data.has_more ? String(data.next_cursor ?? '') : undefined

      for (const page of results) {
        if (page.object !== 'page') continue
        const editedAt = String(page.last_edited_time ?? '')
        if (sinceIso && editedAt < sinceIso) { cursor = undefined; break }

        const title = ((page.properties as Record<string, Record<string, unknown>>)?.Name?.title as Array<{ plain_text: string }> | undefined)
          ?.map(t => t.plain_text).join('')
          ?? ((page.properties as Record<string, Record<string, unknown>>)?.title?.title as Array<{ plain_text: string }> | undefined)
          ?.map(t => t.plain_text).join('')
          ?? String(page.id)

        try {
          const text = await fetchPageText(token, String(page.id))
          if (text.length < 60) continue
          yield {
            content: text,
            sourceId: `notion-${page.id}`,
            sourceUrl: String(page.url ?? ''),
            title,
            timestamp: new Date(editedAt).getTime(),
            contentType: 'doc' as const,
          }
        } catch (e) {
          console.warn(`[notion] page fetch error ${page.id}:`, (e as Error).message)
        }
      }
    } while (cursor)
  },
}
