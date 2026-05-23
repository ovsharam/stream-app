import type { AssistResult, ClusterContext, ClusterSearchHit } from '@shared/cluster'

const API = 'http://localhost:3131'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const clusterApi = {
  context: () => json<ClusterContext>('/cluster/context'),
  search: (q: string) => json<ClusterSearchHit[]>(`/cluster/search?q=${encodeURIComponent(q)}`),
  assist: (query: string) =>
    json<AssistResult>('/cluster/assist', { method: 'POST', body: JSON.stringify({ query }) })
}

export function openMeeting(url: string): void {
  if (window.notchDesktop?.openExternal) {
    window.notchDesktop.openExternal(url)
  } else if (window.notch?.expand) {
    window.notchDesktop?.openExternal?.(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

declare global {
  interface Window {
    notchDesktop?: { openExternal: (url: string) => void }
  }
}
