import type { DataDashboardSnapshot } from '@shared/dashboard'
import { normalizeDashboardSnapshot } from '@shared/dashboard'

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`/api/dashboard${path}`, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export const dashboardApi = {
  getSnapshot: async (since?: number) => {
    const q = since != null ? `?since=${since}` : ''
    const data = await request<DataDashboardSnapshot>(`/dashboard/data${q}`)
    return normalizeDashboardSnapshot(data)
  }
}
