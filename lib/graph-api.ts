import type { ActiveContext, GraphSearchResult } from '@shared/graph'
import type { FdeScoreResult, BrowserContext } from '@shared/scoring'

const BASE = ''

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export const graphApi = {
  context: () => json<ActiveContext>('/graph/context'),

  search: (q: string, limit = 12) =>
    json<GraphSearchResult[]>(`/graph/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  score: (caseId: string) => json<FdeScoreResult>(`/graph/cases/${caseId}/score`),

  syncGmail: () =>
    json<{ items: number; signals: number }>('/graph/gmail/sync', { method: 'POST' }),

  browserContext: () => json<BrowserContext | null>('/browser/context'),

  gmailAuthUrl: () => json<{ url: string }>('/auth/gmail'),

  connections: () =>
    json<{ connected: Record<string, boolean> }>('/connections')
}
