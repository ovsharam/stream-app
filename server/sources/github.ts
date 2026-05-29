import type { Server as SocketServer } from 'socket.io'
import { v4 as uuidv4 } from 'uuid'
import { normalizeGithubItem } from '../normalizer'
import { upsertItems, itemExists } from '../db'
import type { StreamItem } from '../../shared/types'
import { connectWithToken, getIntegrationToken, isTokenConnected } from './integrationTokens'

function pat(): string | undefined {
  const t = getIntegrationToken('github')
  return String(t?.pat ?? t?.token ?? '').trim() || undefined
}

function defaultRepo(): string | undefined {
  const t = getIntegrationToken('github')
  return String(t?.defaultRepo ?? '').trim() || undefined
}

export function connectGithub(patValue: string, defaultRepoValue?: string): void {
  connectWithToken('github', {
    pat: patValue,
    defaultRepo: defaultRepoValue?.trim() || undefined
  })
}

export function isGithubConnected(): boolean {
  return isTokenConnected('github')
}

async function ghFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = pat()
  if (!token) throw new Error('GitHub not connected')
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {})
    }
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export async function syncGithub(io?: SocketServer): Promise<StreamItem[]> {
  if (!isGithubConnected()) return []

  const issues = await ghFetch<
    {
      id: number
      number: number
      title: string
      body?: string | null
      html_url: string
      updated_at: string
      repository_url: string
      pull_request?: unknown
      user?: { login?: string }
    }[]
  >('/issues?filter=all&state=open&sort=updated&per_page=20')

  const items: StreamItem[] = []
  for (const issue of issues) {
    if (!issue.title || issue.pull_request) continue
    const repoMatch = issue.repository_url?.match(/repos\/([^/]+\/[^/]+)/)
    const repo = repoMatch?.[1] ?? 'unknown/unknown'
    const normalized = normalizeGithubItem({
      id: String(issue.id),
      number: issue.number,
      repo,
      title: issue.title,
      body: issue.body ?? '',
      url: issue.html_url,
      updatedAt: new Date(issue.updated_at),
      author: issue.user?.login ?? 'github'
    })
    items.push(normalized)
  }

  if (items.length > 0) {
    const fresh = items.filter((i) => !itemExists(i.id))
    upsertItems(items)
    for (const item of fresh) io?.emit('stream:item', item)
  }
  return items
}

export async function createGithubIssue(input: {
  title: string
  body: string
  repo?: string
}): Promise<{ number: number; url: string }> {
  const repo = input.repo ?? defaultRepo()
  if (!repo || !repo.includes('/')) {
    throw new Error('Use owner/repo in Integrations or @github owner/repo: title')
  }
  const [owner, name] = repo.split('/')
  const created = await ghFetch<{ number: number; html_url: string }>(
    `/repos/${owner}/${name}/issues`,
    {
      method: 'POST',
      body: JSON.stringify({ title: input.title, body: input.body })
    }
  )
  return { number: created.number, url: created.html_url }
}

export async function commentGithubIssue(input: {
  repo: string
  number: number
  body: string
}): Promise<void> {
  const [owner, name] = input.repo.split('/')
  await ghFetch(`/repos/${owner}/${name}/issues/${input.number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: input.body })
  })
}

export function parseGithubRepoTarget(target?: string, body?: string): {
  repo?: string
  title: string
  issueNumber?: number
} {
  if (target && /^\d+$/.test(target)) {
    return { issueNumber: Number(target), title: body ?? '', repo: defaultRepo() }
  }
  if (target && target.includes('/')) {
    const colon = (body ?? '').indexOf(':')
    if (colon >= 0) {
      return {
        repo: target,
        title: body!.slice(0, colon).trim(),
        issueNumber: undefined
      }
    }
    return { repo: target, title: body ?? '' }
  }
  return { repo: defaultRepo(), title: body ?? target ?? '' }
}

export function githubItemId(issueId: string): string {
  return `github-${issueId}`
}

export function newGithubCommentId(): string {
  return `github-comment-${uuidv4()}`
}
