import type { StreamSource } from '@shared/types'
import { streamItemFromApi } from '@shared/serialize'

const BASE = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? 'Request failed')
  }
  return res.json() as Promise<T>
}

export interface ConnectionsResponse {
  connections: Record<'gmail' | 'slack' | 'x' | 'perplexity', boolean>
  configured: Record<string, boolean>
  connected: Record<string, boolean>
  onboardingComplete: boolean
}

export const api = {
  health: () => request<{ ok: boolean }>('/health'),

  getStream: (limit = 100) =>
    request<Record<string, unknown>[]>(`/stream?limit=${limit}`).then((items) =>
      items.map(streamItemFromApi)
    ),

  pollStream: (since: number) =>
    request<Record<string, unknown>[]>(`/stream/poll?since=${since}`).then((items) =>
      items.map(streamItemFromApi)
    ),

  getConnections: () => request<ConnectionsResponse>('/connections'),

  completeOnboarding: () =>
    request<{ ok: boolean }>('/connections/onboarding-complete', { method: 'POST' }),

  updateItem: (id: string, flags: { isUnread?: boolean; isStarred?: boolean }) =>
    request<Record<string, unknown>>(`/stream/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(flags)
    }).then(streamItemFromApi),

  authGmail: () => request<{ url: string }>('/auth/gmail'),
  authSlack: () => request<{ url: string }>('/auth/slack'),
  authX: () => request<{ url: string; state: string }>('/auth/x'),
  authCalcom: () =>
    request<{ url: string; state: string; accountLabel?: string }>('/auth/calcom/oauth'),
  connectCalcom: (apiKey: string, username?: string, eventTypeId?: string) =>
    request<{ ok: boolean; count: number; accountLabel?: string }>('/auth/calcom', {
      method: 'POST',
      body: JSON.stringify({ apiKey, username, eventTypeId })
    }),

  connectPerplexity: (apiKey: string) =>
    request<{ ok: boolean }>('/auth/perplexity', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),

  connectXToken: (token: string) =>
    request<{ ok: boolean; count: number }>('/auth/x/token', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),

  syncAll: () => request<{ gmail: number; slack: number; x: number }>('/sync/all', { method: 'POST' }),

  askAI: (query: string, systemPrompt: string) =>
    request<Record<string, unknown>>('/ai/query', {
      method: 'POST',
      body: JSON.stringify({ query, systemPrompt })
    }).then(streamItemFromApi),

  createNote: (text: string, title?: string) =>
    request<Record<string, unknown>>('/notes', {
      method: 'POST',
      body: JSON.stringify({ text, title })
    }).then(streamItemFromApi)
}

export type { StreamSource }
