import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

const BASE = 'https://api.github.com'

function headers(pat: string) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function ghFetch(pat: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: headers(pat) })
  if (res.status === 429) {
    const retry = Number(res.headers.get('retry-after') ?? 60)
    await new Promise(r => setTimeout(r, retry * 1000))
    return ghFetch(pat, path)
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`)
  return res.json()
}

export const githubConnector: ConnectorImpl = {
  type: 'github',
  label: 'GitHub',
  description: 'Indexes releases, merged PRs, and feature/bug issues from your repositories.',
  authType: 'pat',

  async validate(creds) {
    try {
      const pat = creds.pat ?? creds.accessToken ?? ''
      const data = await ghFetch(pat, '/user') as { login?: string }
      return { ok: !!data.login }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const pat = creds.pat ?? creds.accessToken ?? ''
    const repos = settings.repos ?? []
    if (repos.length === 0) {
      console.warn('[github] no repos configured')
      return
    }

    const sinceIso = since ? new Date(since).toISOString() : '2020-01-01T00:00:00Z'

    for (const repo of repos) {
      // ── Releases ──────────────────────────────────────────────────────────
      try {
        const releases = await ghFetch(pat, `/repos/${repo}/releases?per_page=50`) as Array<{
          id: number; tag_name: string; name: string; body: string; html_url: string; published_at: string
        }>
        for (const rel of releases) {
          if (!rel.body || rel.body.trim().length < 50) continue
          if (since && new Date(rel.published_at).getTime() < since) continue
          const chunk: ConnectorChunk = {
            content: `Release: ${rel.name ?? rel.tag_name}\n\n${rel.body}`,
            sourceId: `github-release-${repo}-${rel.id}`,
            sourceUrl: rel.html_url,
            title: `${repo} ${rel.name ?? rel.tag_name}`,
            timestamp: new Date(rel.published_at).getTime(),
            contentType: 'release',
          }
          yield chunk
        }
      } catch (e) {
        console.warn(`[github] releases error ${repo}:`, (e as Error).message)
      }

      // ── Merged PRs ────────────────────────────────────────────────────────
      try {
        const prs = await ghFetch(
          pat,
          `/repos/${repo}/pulls?state=closed&per_page=50&sort=updated&direction=desc`
        ) as Array<{
          id: number; number: number; title: string; body: string | null
          merged_at: string | null; html_url: string; user: { login: string }
        }>
        for (const pr of prs) {
          if (!pr.merged_at) continue
          if (since && new Date(pr.merged_at).getTime() < since) continue
          if (!pr.body || pr.body.trim().length < 80) continue
          const chunk: ConnectorChunk = {
            content: `PR #${pr.number}: ${pr.title}\n\n${pr.body}`,
            sourceId: `github-pr-${repo}-${pr.number}`,
            sourceUrl: pr.html_url,
            title: `PR: ${pr.title}`,
            author: pr.user.login,
            timestamp: new Date(pr.merged_at).getTime(),
            contentType: 'pr',
          }
          yield chunk
        }
      } catch (e) {
        console.warn(`[github] PRs error ${repo}:`, (e as Error).message)
      }

      // ── Issues (feature/bug/limitation labels) ────────────────────────────
      try {
        const labels = ['feature', 'bug', 'limitation', 'enhancement', 'feature-request']
        for (const label of labels) {
          const issues = await ghFetch(
            pat,
            `/repos/${repo}/issues?state=all&labels=${label}&per_page=50&since=${sinceIso}`
          ) as Array<{
            id: number; number: number; title: string; body: string | null
            html_url: string; created_at: string; user: { login: string }; pull_request?: unknown
          }>
          for (const issue of issues) {
            if (issue.pull_request) continue  // skip PRs that appear as issues
            if (!issue.body || issue.body.trim().length < 60) continue
            const chunk: ConnectorChunk = {
              content: `Issue #${issue.number} [${label}]: ${issue.title}\n\n${issue.body}`,
              sourceId: `github-issue-${repo}-${issue.number}`,
              sourceUrl: issue.html_url,
              title: issue.title,
              author: issue.user.login,
              timestamp: new Date(issue.created_at).getTime(),
              contentType: 'issue',
            }
            yield chunk
          }
        }
      } catch (e) {
        console.warn(`[github] issues error ${repo}:`, (e as Error).message)
      }

      // ── CHANGELOG.md ──────────────────────────────────────────────────────
      try {
        const files = ['CHANGELOG.md', 'CHANGELOG', 'changelog.md', 'HISTORY.md']
        for (const file of files) {
          try {
            const data = await ghFetch(pat, `/repos/${repo}/contents/${file}`) as {
              content?: string; encoding?: string; html_url: string
            }
            if (data.content && data.encoding === 'base64') {
              const text = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
              if (text.length > 100) {
                yield {
                  content: text,
                  sourceId: `github-changelog-${repo}`,
                  sourceUrl: data.html_url,
                  title: `${repo} CHANGELOG`,
                  contentType: 'doc' as const,
                }
                break
              }
            }
          } catch { /* file doesn't exist */ }
        }
      } catch (e) {
        console.warn(`[github] changelog error ${repo}:`, (e as Error).message)
      }
    }
  },
}
