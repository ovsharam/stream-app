import type { AssistResult, ClusterSearchHit } from '@shared/cluster'

const API = import.meta.env.VITE_CLUSTER_API ?? 'http://localhost:3000'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const mobileApi = {
  search: (q: string) => json<ClusterSearchHit[]>(`/cluster/search?q=${encodeURIComponent(q)}`),
  assist: (query: string) =>
    json<AssistResult>('/cluster/assist', { method: 'POST', body: JSON.stringify({ query }) })
}
