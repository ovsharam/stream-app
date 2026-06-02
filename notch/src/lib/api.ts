import type { MobileContext } from '@shared/mobile'
import type { AssistResult, CentralStreamEvent, ClusterThread } from '@shared/cluster'
import { loadMobileSettings } from './mobile-settings'
import type { UserRole } from './user-role'

const API = 'http://localhost:3131'

async function json<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs = 120_000, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${API}/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...fetchInit.headers },
      signal: controller.signal,
      ...fetchInit
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
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — check Integrations and try again`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
  approveMeetingAction: (input: { itemId: string; actionId: string }) =>
    json<import('@shared/cluster').ComposeActionResult & { ok: boolean }>(
      '/cluster/meeting/approve',
      {
        method: 'POST',
        body: JSON.stringify(input),
        timeoutMs: 90_000
      }
    ),
  markSeen: (itemId: string) =>
    json<{ ok: boolean }>(`/kb/seen/${encodeURIComponent(itemId.replace(/^ext-/, ''))}`, {
      method: 'POST',
      body: '{}'
    }),
  kbContext: (q: string) =>
    json<import('@shared/personal-kb').GraphRagContext>(
      `/kb/context?q=${encodeURIComponent(q)}`
    ),
  kbStream: (text: string) =>
    json<{ ok: boolean; datapoint: import('@shared/personal-kb').Datapoint }>('/kb/stream', {
      method: 'POST',
      body: JSON.stringify({ text })
    }),
  kbStats: () =>
    json<{
      datapoints: number
      entities: number
      traces: number
      recent: {
        id: string
        excerpt: string
        intention: string
        kind?: string
        source?: string
        ingestedAt: number
      }[]
    }>('/kb/stats'),
  search: (q: string, timeoutMs = 15_000) =>
    json<import('@shared/cluster').ClusterSearchHit[]>(
      `/cluster/search?q=${encodeURIComponent(q)}`,
      { timeoutMs }
    ),
  calendar: () =>
    json<import('@shared/cluster').CalendarRailResponse>('/cluster/calendar'),
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
  assist: (
    query: string,
    objective?: 'discovery' | 'v1_ship',
    options?: {
      chat?: boolean
      history?: { role: 'user' | 'assistant'; content: string }[]
      timeoutMs?: number
    }
  ) =>
    json<AssistResult>('/cluster/assist', {
      method: 'POST',
      body: JSON.stringify({
        query,
        objective,
        chat: options?.chat === true,
        history: options?.history
      }),
      timeoutMs: options?.timeoutMs ?? 25_000
    }),
  engagements: () =>
    json<{ engagements: import('@shared/fde-engagement').FdeEngagement[] }>('/fde/engagements'),
  createEngagement: (input: { clientName: string; company?: string }) =>
    json<{ engagement: import('@shared/fde-engagement').FdeEngagement }>('/fde/engagements', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  patchEngagement: (
    id: string,
    patch: Partial<import('@shared/fde-engagement').FdeEngagement>
  ) =>
    json<{ engagement: import('@shared/fde-engagement').FdeEngagement }>(
      `/fde/engagements/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
  mcpAgents: () =>
    json<{ agents: import('@shared/fde-engagement').CustomMcpAgent[] }>('/fde/mcp-agents'),
  saveMcpAgent: (input: Omit<import('@shared/fde-engagement').CustomMcpAgent, 'id' | 'createdAt'> & { id?: string }) =>
    json<{ agent: import('@shared/fde-engagement').CustomMcpAgent }>('/fde/mcp-agents', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  deleteMcpAgent: (id: string) =>
    json<{ ok: boolean }>(`/fde/mcp-agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
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
  xAuthUrl: () => json<{ url: string; state: string }>('/auth/x'),
  calcomAuthUrl: () =>
    json<{ url: string; state: string; accountLabel?: string }>('/auth/calcom/oauth'),
  connectCalcom: (apiKey: string, username?: string, eventTypeId?: string) =>
    json<{ ok: boolean; count: number; accountLabel?: string }>('/auth/calcom', {
      method: 'POST',
      body: JSON.stringify({ apiKey, username, eventTypeId })
    }),
  connectXToken: (token: string) =>
    json<{ ok: boolean; count: number }>('/auth/x/token', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),
  connectMondayToken: (token: string) =>
    json<{ ok: boolean; count: number; writeAccess?: boolean; warning?: string }>(
      '/auth/monday/token',
      {
        method: 'POST',
        body: JSON.stringify({ token })
      }
    ),
  connectDiscordToken: (token: string, channelIds: string[]) =>
    json<{ ok: boolean; count: number }>('/auth/discord/token', {
      method: 'POST',
      body: JSON.stringify({ token, channelIds })
    }),
  connectPerplexity: (apiKey: string, accountEmail?: string) =>
    json<{ ok: boolean; count: number; accountLabel?: string }>('/auth/perplexity', {
      method: 'POST',
      body: JSON.stringify({ apiKey, accountEmail })
    }),
  perplexityAuthUrl: () =>
    json<{ signInUrl: string; portalUrl: string; accountLabel?: string }>('/auth/perplexity'),
  connectClaude: (apiKey: string) =>
    json<{ ok: boolean }>('/auth/claude', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),
  claudeAuthUrl: () =>
    json<{ url: string; localAccount?: { label: string; subscriptionType?: string } | null }>(
      '/auth/claude'
    ),
  connectClaudeCode: (code: string) =>
    json<{ ok: boolean; count: number; accountLabel?: string }>('/auth/claude/code', {
      method: 'POST',
      body: JSON.stringify({ code })
    }),
  importClaudeLocal: () =>
    json<{ ok: boolean; count: number; accountLabel?: string; subscriptionType?: string }>(
      '/auth/claude/import',
      { method: 'POST', body: '{}' }
    ),
  refreshClaudeApiKey: () =>
    json<{ ok: boolean; accountLabel?: string }>('/auth/claude/refresh-key', {
      method: 'POST',
      body: '{}'
    }),
  connectGemini: (apiKey: string) =>
    json<{ ok: boolean }>('/auth/gemini', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),
  connectCursor: (apiKey: string, repo?: string) =>
    json<{ ok: boolean }>('/auth/cursor', {
      method: 'POST',
      body: JSON.stringify({ apiKey, repo })
    }),
  connectGithub: (pat: string, defaultRepo?: string) =>
    json<{ ok: boolean; count: number }>('/auth/github', {
      method: 'POST',
      body: JSON.stringify({ pat, defaultRepo })
    }),
  connectGong: (accessKey: string, accessSecret: string) =>
    json<{ ok: boolean; count: number }>('/auth/gong', {
      method: 'POST',
      body: JSON.stringify({ accessKey, accessSecret })
    }),
  syncSource: (
    source:
      | 'gmail'
      | 'slack'
      | 'x'
      | 'monday'
      | 'discord'
      | 'github'
      | 'gdocs'
      | 'gong'
      | 'claude'
      | 'perplexity'
      | 'calcom'
  ) => json<{ count: number }>(`/auth/${source}/sync`, { method: 'POST', body: '{}' })
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

export function canUseInAppWorkspace(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
  )
}

export function openInWorkspace(
  url: string,
  opts?: { title?: string; source?: string; summary?: string; id?: string; activate?: boolean }
): boolean {
  if (!canUseInAppWorkspace()) return false
  window.dispatchEvent(
    new CustomEvent('notch:open-workspace', {
      detail: { url, activate: opts?.activate !== false, ...opts }
    })
  )
  return true
}

export function openMeeting(url: string, title?: string): void {
  if (openInWorkspace(url, { title: title ?? 'Google Meet', source: 'meet', summary: title })) {
    return
  }
  window.notchDesktop?.openExternal?.(url)
}

export function openExternal(url: string): void {
  window.notchDesktop?.openExternal?.(url)
}

declare global {
  interface Window {
    notchDesktop?: {
      openExternal: (url: string) => void
      showNavApp?: (args: {
        partition: string
        url: string
        bounds: { x: number; y: number; width: number; height: number }
      }) => Promise<{ ok: boolean }>
      hideNavApp?: () => Promise<{ ok: boolean }>
      destroyNavApp?: () => Promise<{ ok: boolean }>
      reloadNavApp?: () => Promise<{ ok: boolean }>
      getNavAppPlayback?: () => Promise<{ playing: boolean }>
      setNavAppTheme?: (theme: string) => Promise<{ ok: boolean }>
      openAuthWindow?: (args: { partition: string; url: string; title?: string }) => Promise<{ ok: boolean }>
      onAuthClosed?: (cb: (partition: string) => void) => () => void
      onNavAppRendererReady?: (cb: () => void) => () => void
    }
  }
}
