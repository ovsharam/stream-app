import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

const GQL = 'https://api.linear.app/graphql'

async function linearQuery(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 10000))
    return linearQuery(apiKey, query, variables)
  }
  const data = await res.json() as { data?: Record<string, unknown>; errors?: unknown[] }
  if (data.errors) throw new Error(`Linear GraphQL error: ${JSON.stringify(data.errors)}`)
  return data.data ?? {}
}

const ISSUES_QUERY = `
  query Issues($filter: IssueFilter, $after: String) {
    issues(filter: $filter, first: 50, after: $after, orderBy: updatedAt) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id identifier title description url
        createdAt updatedAt
        state { name }
        labels { nodes { name } }
        team { name }
        comments { nodes { body createdAt user { name } } }
      }
    }
  }
`

export const linearConnector: ConnectorImpl = {
  type: 'linear',
  label: 'Linear',
  description: 'Indexes feature requests, bugs, and project updates to track the product lifecycle.',
  authType: 'api_key',

  async validate(creds) {
    try {
      const data = await linearQuery(creds.apiKey ?? '', `{ viewer { id name } }`)
      return { ok: !!(data as Record<string, Record<string,string>>).viewer?.id }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const apiKey = creds.apiKey ?? ''
    const sinceIso = since ? new Date(since).toISOString() : new Date(Date.now() - 180 * 86400000).toISOString()

    const filter: Record<string, unknown> = {
      updatedAt: { gte: sinceIso },
      or: [
        { type: { eq: 'feature' } },
        { type: { eq: 'bug' } },
        { label: { name: { in: ['feature', 'bug', 'limitation', 'enhancement'] } } },
      ],
    }

    if (settings.teamIds && settings.teamIds.length > 0) {
      filter.team = { id: { in: settings.teamIds } }
    }

    let cursor: string | undefined
    let hasMore = true

    while (hasMore) {
      const data = await linearQuery(apiKey, ISSUES_QUERY, {
        filter,
        after: cursor,
      }) as {
        issues: {
          pageInfo: { hasNextPage: boolean; endCursor: string }
          nodes: Array<{
            id: string; identifier: string; title: string; description: string | null
            url: string; createdAt: string; updatedAt: string
            state: { name: string }
            labels: { nodes: Array<{ name: string }> }
            team: { name: string }
            comments: { nodes: Array<{ body: string; createdAt: string; user: { name: string } }> }
          }>
        }
      }

      const { nodes, pageInfo } = data.issues
      hasMore = pageInfo.hasNextPage
      cursor = pageInfo.endCursor

      for (const issue of nodes) {
        const labelNames = issue.labels.nodes.map(l => l.name).join(', ')
        const parts: string[] = [
          `[Linear ${issue.identifier}] ${issue.title}`,
          `Team: ${issue.team.name} | Status: ${issue.state.name}${labelNames ? ` | Labels: ${labelNames}` : ''}`,
        ]
        if (issue.description && issue.description.trim().length > 20) {
          parts.push('', issue.description)
        }
        if (issue.comments.nodes.length > 0) {
          parts.push('\nComments:')
          for (const c of issue.comments.nodes.slice(0, 10)) {
            if (c.body && c.body.trim().length > 20) {
              parts.push(`  [${c.user.name}]: ${c.body}`)
            }
          }
        }

        const content = parts.join('\n').trim()
        if (content.length < 60) continue

        yield {
          content,
          sourceId: `linear-${issue.id}`,
          sourceUrl: issue.url,
          title: issue.title,
          timestamp: new Date(issue.updatedAt).getTime(),
          contentType: 'issue' as const,
        }
      }
    }
  },
}
