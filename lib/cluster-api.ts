import type { AssistResult, ClusterContext, ClusterSearchHit } from '@shared/cluster'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.json()
}

export const clusterApi = {
  context: () => json<ClusterContext>('/cluster/context'),
  search: (q: string) => json<ClusterSearchHit[]>(`/cluster/search?q=${encodeURIComponent(q)}`),
  assist: (query: string, liveContext?: string) =>
    json<AssistResult>('/cluster/assist', {
      method: 'POST',
      body: JSON.stringify({ query, liveContext })
    })
}
