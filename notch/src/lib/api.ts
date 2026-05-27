import type { MobileContext } from '@shared/mobile'
import type { AssistResult, CentralStreamEvent, ClusterThread } from '@shared/cluster'
import { loadMobileSettings } from './mobile-settings'
import type { UserRole } from './user-role'

const API = 'http://localhost:3131'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init
  })
  const text = await res.text()

  const parseBody = (): unknown => {
    if (!text.trim()) return null
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error(
        `Stream API returned HTML (${res.status}) for ${path}. Restart with npm run dev:notch so the server picks up new routes.`
      )
    }
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error(`Invalid API response from ${path} (${res.status})`)
    }
  }

  if (!res.ok) {
    const parsed = parseBody() as { error?: string; message?: string } | null
    throw new Error(parsed?.error ?? parsed?.message ?? (text || `Request failed (${res.status})`))
  }

  return parseBody() as T
}

export const clusterApi = {
  context: () => json<import('@shared/cluster').ClusterContext>('/cluster/context'),
  stream: (role: UserRole) => json<CentralStreamEvent[]>(`/cluster/stream?role=${encodeURIComponent(role)}`),
  thread: (itemId: string, day?: string) =>
    json<ClusterThread>(
      `/cluster/thread?itemId=${encodeURIComponent(itemId)}${day ? `&day=${encodeURIComponent(day)}` : ''}`
    ),
  mondayComment: (itemId: string, body: string) =>
    json<{ ok: boolean; updateId: string }>('/cluster/monday/comment', {
      method: 'POST',
      body: JSON.stringify({ itemId, body })
    }),
  mondayMove: (input: {
    itemId: string
    boardId: string
    columnId: string
    statusIndex: number
  }) =>
    json<{ ok: boolean }>('/cluster/monday/move', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  mondayRun: (itemId: string, command: string) =>
    json<import('@shared/cluster').MondayRunResult>('/cluster/monday/run', {
      method: 'POST',
      body: JSON.stringify({ itemId, command })
    }),
  mondayCreate: (input: { name: string; boardName?: string }) =>
    json<import('@shared/cluster').MondayCreateResult>('/cluster/monday/create', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  mondayCreateTarget: () =>
    json<{ connected: boolean; target: import('@shared/cluster').MondayCreateTarget | null }>(
      '/cluster/monday/create-target'
    ),
  runAction: (input: { text: string; contextItemId?: string }) =>
    json<import('@shared/cluster').ComposeActionResult>('/cluster/action', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  actionHelp: () =>
    json<{ help: { provider: string; examples: string[] }[] }>('/cluster/action/help'),
  search: (q: string) => json<import('@shared/cluster').ClusterSearchHit[]>(`/cluster/search?q=${encodeURIComponent(q)}`),
  calendar: () =>
    json<{
      events: import('@shared/cluster').CalendarRailEvent[]
      connected: boolean
      error?: string
      needsReconnect?: boolean
    }>('/cluster/calendar'),
  calendars: () =>
    json<{ calendars: import('@shared/cluster').GoogleCalendarOption[]; error?: string }>(
      '/cluster/calendars'
    ),
  saveCalendars: (calendarIds: string[]) =>
    json<{ ok: boolean; calendars: import('@shared/cluster').GoogleCalendarOption[] }>(
      '/cluster/calendars',
      { method: 'PATCH', body: JSON.stringify({ calendarIds }) }
    ),
  gmailAccounts: () =>
    json<{ accounts: import('@shared/cluster').GmailAccount[] }>('/cluster/gmail/accounts'),
  updateGmailAccount: (
    accountId: string,
    patch: { feedEnabled?: boolean; calendarEnabled?: boolean }
  ) =>
    json<{ ok: boolean; accounts: import('@shared/cluster').GmailAccount[] }>(
      `/cluster/gmail/accounts/${encodeURIComponent(accountId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
  removeGmailAccount: (accountId: string) =>
    json<{ ok: boolean; accounts: import('@shared/cluster').GmailAccount[] }>(
      `/cluster/gmail/accounts/${encodeURIComponent(accountId)}`,
      { method: 'DELETE' }
    ),
  mondayAccount: () =>
    json<{ account: import('@shared/cluster').MondayAccount | null; error?: string }>(
      '/cluster/monday/account'
    ),
  assist: (query: string, objective?: 'discovery' | 'v1_ship') =>
    json<AssistResult>('/cluster/assist', {
      method: 'POST',
      body: JSON.stringify({ query, objective })
    })
}

export type IntegrationConnections = {
  connections: Record<string, boolean>
  configured: Record<string, boolean>
  connected: Record<string, boolean>
  syncErrors?: Record<string, string | undefined>
  googleApiEnable?: Record<string, string | undefined>
  onboardingComplete: boolean
}

export const integrationApi = {
  connections: () => json<IntegrationConnections>('/connections'),
  syncAll: () => json<Record<string, number>>('/sync/all', { method: 'POST', body: '{}' }),
  gmailAuthUrl: (addAccount = false) =>
    json<{ url: string; simulated?: boolean }>(
      `/auth/gmail${addAccount ? '?addAccount=1' : ''}`
    ),
  connectXToken: (token: string) =>
    json<{ ok: boolean; count: number }>('/auth/x/token', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),
  connectMondayToken: (token: string) =>
    json<{ ok: boolean; count: number }>('/auth/monday/token', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),
  connectDiscordToken: (token: string, channelIds: string[]) =>
    json<{ ok: boolean; count: number }>('/auth/discord/token', {
      method: 'POST',
      body: JSON.stringify({ token, channelIds })
    }),
  syncSource: (source: 'gmail' | 'slack' | 'x' | 'monday' | 'discord') =>
    json<{ count: number }>(`/auth/${source}/sync`, { method: 'POST', body: '{}' })
}

export const mobileApi = {
  context: () => {
    const s = loadMobileSettings()
    return json<MobileContext>(`/mobile/context?objective=${s.objective}`)
  },
  assist: (query: string) => {
    const s = loadMobileSettings()
    return clusterApi.assist(query, s.objective)
  },
  startCall: () => json<{ ok: boolean }>('/sim/start-call', { method: 'POST', body: '{}' }),
  endCall: () => json<{ ok: boolean }>('/sim/end-call', { method: 'POST', body: '{}' })
}

export function openMeeting(url: string): void {
  window.notchDesktop?.openExternal?.(url)
}

export function openExternal(url: string): void {
  window.notchDesktop?.openExternal?.(url)
}

declare global {
  interface Window {
    notchDesktop?: { openExternal: (url: string) => void }
  }
}
