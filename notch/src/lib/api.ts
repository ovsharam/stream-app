import type { MobileContext } from '@shared/mobile'
import type { AssistResult, CentralStreamEvent, ClusterThread } from '@shared/cluster'
import { loadMobileSettings } from './mobile-settings'
import type { UserRole } from './user-role'

const API = 'http://localhost:3131'

async function json<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }
): Promise<T> {
  const { timeoutMs = 120_000, signal: externalSignal, ...fetchInit } = init ?? {}
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort)
  }

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
        if (res.status === 413) {
          throw new Error(
            `Prompt too large for ${path} (${res.status}). Shorten the build brief and try again.`
          )
        }
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
    if (err instanceof TypeError && /failed to fetch/i.test(err.message)) {
      throw new Error(
        'Cannot reach the Stream API at localhost:3131 — run npm run dev:notch (or dev:api) and try again'
      )
    }
    throw err
  } finally {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
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
  runAction: (
    input: { text: string; contextItemId?: string },
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ) =>
    json<import('@shared/cluster').ComposeActionResult>('/cluster/action', {
      method: 'POST',
      body: JSON.stringify(input),
      signal: options?.signal,
      timeoutMs: options?.timeoutMs
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
  kbGraph: (opts?: {
    mode?: 'structured' | 'memories' | 'full'
    maxEntities?: number
    maxDatapoints?: number
    maxEdges?: number
  }) => {
    const params = new URLSearchParams()
    if (opts?.mode) params.set('mode', opts.mode)
    if (opts?.maxEntities) params.set('maxEntities', String(opts.maxEntities))
    if (opts?.maxDatapoints) params.set('maxDatapoints', String(opts.maxDatapoints))
    if (opts?.maxEdges) params.set('maxEdges', String(opts.maxEdges))
    const q = params.toString()
    return json<import('@shared/kb-graph').KbGraphSnapshot>(`/kb/graph${q ? `?${q}` : ''}`)
  },
  search: (q: string, timeoutMs = 15_000) =>
    json<import('@shared/cluster').ClusterSearchHit[]>(
      `/cluster/search?q=${encodeURIComponent(q)}`,
      { timeoutMs }
    ),
  calendar: () =>
    json<import('@shared/cluster').CalendarRailResponse>('/cluster/calendar'),
  calendars: (refresh = false) =>
    json<{ calendars: import('@shared/cluster').GoogleCalendarOption[]; error?: string }>(
      `/cluster/calendars${refresh ? '?refresh=1' : ''}`
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
  gmailCalendarInvite: (params: { threadId?: string; accountId?: string; streamItemId?: string }) => {
    const q = new URLSearchParams()
    if (params.threadId) q.set('threadId', params.threadId)
    if (params.accountId) q.set('accountId', params.accountId)
    if (params.streamItemId) q.set('streamItemId', params.streamItemId)
    return json<import('@shared/gmail-calendar-invite').GmailCalendarInvite & {
      threadId: string
      accountId: string
      subject: string
      gmailUrl: string
    }>(`/cluster/gmail/calendar-invite?${q.toString()}`)
  },
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
      pageContext?: { url: string; title: string; excerpt?: string; selectedText?: string }
      timeoutMs?: number
      signal?: AbortSignal
    }
  ) =>
    json<AssistResult>('/cluster/assist', {
      method: 'POST',
      body: JSON.stringify({
        query,
        objective,
        chat: options?.chat === true,
        history: options?.history,
        pageContext: options?.pageContext
      }),
      timeoutMs: options?.timeoutMs ?? 25_000,
      signal: options?.signal
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
    patch: Partial<import('@shared/fde-engagement').FdeEngagement> & { scopeApproved?: boolean }
  ) =>
    json<{ engagement: import('@shared/fde-engagement').FdeEngagement }>(
      `/fde/engagements/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),
  engagementHandoff: (id: string) =>
    json<{ handoff: import('@shared/handoff').HandoffBrief }>(
      `/fde/engagements/${encodeURIComponent(id)}/handoff`
    ),
  engagementFromProposal: (proposalId: string) =>
    json<{ engagement: import('@shared/fde-engagement').FdeEngagement }>(
      `/fde/engagements/from-proposal/${encodeURIComponent(proposalId)}`,
      { method: 'POST', body: '{}' }
    ),
  mcpAgents: () =>
    json<{ agents: import('@shared/fde-engagement').CustomMcpAgent[] }>('/fde/mcp-agents'),
  trainingSummary: () =>
    json<import('@shared/fde-training').FdeTrainingCorpusStats>('/fde/training/summary'),
  trainingDecisions: (engagementId: string) =>
    json<{ events: import('@shared/fde-training').FdeDecisionEvent[] }>(
      `/fde/training/decisions/${encodeURIComponent(engagementId)}`
    ),
  trainingFeedback: (input: {
    engagementId: string
    text: string
    source?: import('@shared/fde-training').FeedbackSource
    feedbackType?: import('@shared/fde-training').FeedbackType
    requirementId?: string
    buildRunId?: string
  }) =>
    json<{ ok: boolean }>('/fde/training/feedback', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  graphSync: () =>
    json<import('@shared/graph-sync').GraphSyncResult>('/graph/sync', { method: 'POST' }),
  graphStats: () =>
    json<{
      entities: number
      edges: number
      deals: number
      falkorConfigured: boolean
      falkorConnected: boolean
      falkorNodes?: number
      falkorGraphEdges?: number
    }>('/graph/stats'),
  graphNeighbors: (engagementId: string, hops = 2) =>
    json<{ engagementId: string; neighbors: { id: string; name?: string; label?: string }[] }>(
      `/graph/neighbors/${encodeURIComponent(engagementId)}?hops=${hops}`
    ),
  explainFeedRank: (eventId: string, role = 'fde') =>
    json<{ eventId: string; breakdown: import('@shared/graph-sync').FeedRankBreakdown }>(
      `/cluster/feed/rank?eventId=${encodeURIComponent(eventId)}&role=${encodeURIComponent(role)}`
    ),
  saveMcpAgent: (input: Omit<import('@shared/fde-engagement').CustomMcpAgent, 'id' | 'createdAt'> & { id?: string }) =>
    json<{ agent: import('@shared/fde-engagement').CustomMcpAgent }>('/fde/mcp-agents', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  deleteMcpAgent: (id: string) =>
    json<{ ok: boolean }>(`/fde/mcp-agents/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export const captureApi = {
  state: () => json<import('@shared/capture').CaptureState>('/capture/state'),
  saveState: (patch: {
    profiles?: import('@shared/capture').CaptureProfile[]
    activeProfileId?: string
  }) =>
    json<import('@shared/capture').CaptureState>('/capture/state', {
      method: 'PUT',
      body: JSON.stringify(patch)
    }),
  note: (input: {
    text: string
    title?: string
    profileId?: string
    destinations?: import('@shared/capture').CaptureDestination[]
  }) =>
    json<import('@shared/capture').CaptureNoteResult>('/capture/note', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  addReminder: (input: { text: string; dueAt: string; profileId?: string }) =>
    json<import('@shared/capture').Reminder>('/capture/reminder', {
      method: 'POST',
      body: JSON.stringify(input)
    }),
  updateReminder: (id: string, patch: Partial<{ done: boolean; text: string; dueAt: string }>) =>
    json<import('@shared/capture').Reminder>(`/capture/reminder/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    }),
  deleteReminder: (id: string) =>
    json<{ ok: boolean }>(`/capture/reminder/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  exportMeeting: (sessionId: string, mode: 'full' | 'summary' = 'full') =>
    json<{ markdown: string; mode: string }>(
      `/capture/meeting/${encodeURIComponent(sessionId)}/export?mode=${mode}`
    ),
  appendMeeting: (sessionId: string, input?: { profileId?: string; mode?: 'full' | 'summary' }) =>
    json<import('@shared/capture').CaptureNoteResult>(
      `/capture/meeting/${encodeURIComponent(sessionId)}/append`,
      { method: 'POST', body: JSON.stringify(input ?? {}) }
    )
}

export const contactsApi = {
  state: () => json<import('@shared/contacts').ContactsState>('/contacts'),
  sync: () =>
    json<import('@shared/contacts').ContactsState>('/contacts/sync', {
      method: 'POST',
      body: '{}'
    })
}

export type IntegrationConnections = {
  connections: Record<string, boolean>
  configured: Record<string, boolean>
  connected: Record<string, boolean>
  syncErrors?: Record<string, string | undefined>
  googleApiEnable?: Record<string, string | undefined>
  googleApi?: {
    blocked: boolean
    blockedUntilMs: number | null
    blockedUntil: string | null
    lastReason: string | null
  }
  onboardingComplete: boolean
}

export const integrationApi = {
  connections: () => json<IntegrationConnections>('/connections'),
  syncAll: () => json<Record<string, number>>('/sync/all', { method: 'POST', body: '{}' }),
  gmailAuthUrl: (addAccount = false) =>
    json<{ url: string; simulated?: boolean }>(
      `/auth/gmail${addAccount ? '?addAccount=1' : ''}`
    ),
  gmailDisconnect: () =>
    json<{ ok: boolean }>('/auth/gmail/disconnect', { method: 'POST', body: '{}' }),
  slackAuthUrl: () => json<{ url: string }>('/auth/slack'),
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
  connectCursor: (
    apiKey: string,
    opts?: { repo?: string; mode?: 'local' | 'cloud'; activeLocalProjectId?: string }
  ) =>
    json<{ ok: boolean; accountEmail?: string; accountName?: string }>('/auth/cursor', {
      method: 'POST',
      body: JSON.stringify({ apiKey, ...opts })
    }),
  cursorBuildStatus: () => json<import('@shared/cursor-build').CursorBuildStatus>('/integrations/cursor/status'),
  cursorSetSettings: (body: {
    mode?: 'local' | 'cloud'
    activeLocalProjectId?: string
    repo?: string
  }) =>
    json<{ ok: boolean; ready: boolean }>('/integrations/cursor/settings', {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),
  cursorAddProject: (path: string, name?: string) =>
    json<{ ok: boolean; project: import('@shared/cursor-build').CursorLocalProject; ready: boolean }>(
      '/integrations/cursor/projects',
      { method: 'POST', body: JSON.stringify({ path, name }) }
    ),
  cursorCreateProject: (name: string, parent?: string) =>
    json<{ ok: boolean; project: import('@shared/cursor-build').CursorLocalProject; ready: boolean }>(
      '/integrations/cursor/projects',
      { method: 'POST', body: JSON.stringify({ create: true, name, parent }) }
    ),
  cursorRemoveProject: (id: string) =>
    json<{ ok: boolean; ready: boolean }>(`/integrations/cursor/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }),
  cursorProjectAgents: (id: string) =>
    json<{ agents: Array<{ agentId: string; name: string; status?: string; summary?: string }> }>(
      `/integrations/cursor/projects/${encodeURIComponent(id)}/agents`
    ),
  cursorReconcileBuilds: () =>
    json<{ updated: number }>('/integrations/cursor/reconcile', { method: 'POST' }),
  buildAgentsStatus: () => json<import('@shared/build-executor').BuildAgentsStatus>('/build/status'),
  buildRun: (body: {
    executor: import('@shared/build-executor').BuildExecutor
    prompt: string
    projectId?: string
  }) =>
    json<import('@shared/build-executor').BuildRunResult>('/build/run', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 120_000
    }),
  buildCancelAll: () =>
    json<{ ok: boolean; cancelled: number }>('/build/cancel-all', { method: 'POST' }),
  buildCancel: (itemId: string) =>
    json<{ ok: boolean }>('/build/cancel', {
      method: 'POST',
      body: JSON.stringify({ itemId })
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

export const telemetryApi = {
  ingestEvents: (events: import('@shared/operator-events').OperatorEvent[]) =>
    json<{ ok: boolean; inserted: number }>('/telemetry/events', {
      method: 'POST',
      body: JSON.stringify({ events })
    })
}

export const agentApi = {
  ingestLinkedIn: (input: import('@shared/agent-proposal').LinkedInIngestInput) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal; duplicate?: boolean }>(
      '/agent/linkedin/ingest',
      { method: 'POST', body: JSON.stringify(input) }
    ),
  listProposals: (status?: import('@shared/agent-proposal').AgentProposalStatus) =>
    json<{ proposals: import('@shared/agent-proposal').AgentProposal[]; pendingCount?: number }>(
      `/agent/proposals${status ? `?status=${encodeURIComponent(status)}` : ''}`
    ),
  approveProposal: (id: string, body: import('@shared/agent-proposal').ApproveAgentProposalInput = {}) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal }>(
      `/agent/proposals/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  rejectProposal: (id: string, reason?: string) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal }>(
      `/agent/proposals/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  refreshProposal: (id: string, linkedinReply?: string) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal }>(
      `/agent/proposals/${encodeURIComponent(id)}/refresh`,
      {
        method: 'POST',
        body: JSON.stringify(linkedinReply?.trim() ? { linkedinReply: linkedinReply.trim() } : {})
      }
    ),
  updateDraft: (id: string, linkedinReply: string) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal }>(
      `/agent/proposals/${encodeURIComponent(id)}/draft`,
      { method: 'PATCH', body: JSON.stringify({ linkedinReply }) }
    ),
  snoozeProposal: (
    id: string,
    body: import('@shared/agent-proposal').SnoozeAgentProposalInput = {}
  ) =>
    json<{ proposal: import('@shared/agent-proposal').AgentProposal }>(
      `/agent/proposals/${encodeURIComponent(id)}/snooze`,
      { method: 'POST', body: JSON.stringify(body) }
    )
}

export function canUseInAppWorkspace(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.notchDesktop != null || /Electron/i.test(navigator.userAgent))
  )
}

function hostMatches(hostname: string, pattern: string): boolean {
  return hostname === pattern || hostname.endsWith(`.${pattern}`)
}

/** OAuth setup, Cursor, etc. — must use the system browser. */
const FORCE_EXTERNAL_HOSTS = [
  'cursor.com',
  'authenticate.cursor.sh',
  'console.cloud.google.com',
  'developers.google.com',
  'workos.com'
]

export function shouldForceExternal(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return FORCE_EXTERNAL_HOSTS.some((h) => hostMatches(hostname, h))
  } catch {
    return false
  }
}

export function inferWorkspaceMeta(url: string): {
  title: string
  source: 'meet' | 'gmail' | 'calendar' | 'gdocs' | 'monday' | 'slack' | 'youtube' | 'discord' | 'github' | 'calcom' | 'linkedin'
} {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (hostMatches(u.hostname, 'docs.google.com')) {
      const docId = u.pathname.match(/\/document\/d\/([^/]+)/)?.[1]
      return { title: docId ? `Doc · ${docId.slice(0, 8)}…` : 'Google Doc', source: 'gdocs' }
    }
    if (hostMatches(u.hostname, 'drive.google.com')) return { title: 'Google Drive', source: 'gdocs' }
    if (hostMatches(u.hostname, 'meet.google.com')) return { title: 'Google Meet', source: 'meet' }
    if (hostMatches(u.hostname, 'mail.google.com')) return { title: 'Gmail', source: 'gmail' }
    if (hostMatches(u.hostname, 'calendar.google.com')) return { title: 'Calendar', source: 'calendar' }
    if (hostMatches(u.hostname, 'monday.com')) return { title: 'Monday', source: 'monday' }
    if (hostMatches(u.hostname, 'slack.com')) return { title: 'Slack', source: 'slack' }
    if (hostMatches(u.hostname, 'youtube.com')) return { title: 'YouTube', source: 'youtube' }
    if (hostMatches(u.hostname, 'linkedin.com')) return { title: 'LinkedIn', source: 'linkedin' }
    if (hostMatches(u.hostname, 'cal.com')) return { title: 'Cal.com', source: 'calcom' }
    if (hostMatches(u.hostname, 'discord.com')) return { title: 'Discord', source: 'discord' }
    if (hostMatches(u.hostname, 'github.com')) return { title: 'GitHub', source: 'github' }
    if (host === 'google.com') return { title: 'Google', source: 'meet' }
    return { title: host, source: 'meet' }
  } catch {
    return { title: 'Tab', source: 'meet' }
  }
}

export function openInWorkspace(
  url: string,
  opts?: {
    title?: string
    source?: string
    summary?: string
    id?: string
    activate?: boolean
    tabKind?: 'pinned' | 'temp'
    pinId?: string
  }
): boolean {
  if (!canUseInAppWorkspace()) return false
  const inferred = inferWorkspaceMeta(url)
  window.dispatchEvent(
    new CustomEvent('notch:open-workspace', {
      detail: {
        url,
        activate: opts?.activate !== false,
        title: opts?.title ?? inferred.title,
        source: opts?.source ?? inferred.source,
        summary: opts?.summary,
        id: opts?.id,
        tabKind: opts?.tabKind,
        pinId: opts?.pinId
      }
    })
  )
  return true
}

/** In-app Chrome-style tab when possible; system browser for OAuth-only hosts (Cursor, GCP console). */
export function openBrowserLink(
  url: string,
  opts?: {
    title?: string
    source?: string
    summary?: string
    id?: string
    activate?: boolean
    forceExternal?: boolean
    tabKind?: 'pinned' | 'temp'
    pinId?: string
  }
): void {
  if (!url?.startsWith('http')) return
  if (!opts?.forceExternal && !shouldForceExternal(url) && openInWorkspace(url, opts)) {
    return
  }
  window.notchDesktop?.openExternal?.(url)
}

export function openMeeting(url: string, title?: string): void {
  openBrowserLink(url, { title: title ?? 'Google Meet', source: 'meet', summary: title })
}

export function openExternal(url: string): void {
  openBrowserLink(url)
}

declare global {
  interface Window {
    notchDesktop?: {
      openExternal: (url: string) => void
      showNavApp?: (args: {
        partition: string
        url: string
        bounds: { x: number; y: number; width: number; height: number }
        layout?: 'full' | 'mini'
      }) => Promise<{ ok: boolean }>
      hideNavApp?: () => Promise<{ ok: boolean }>
      destroyNavApp?: () => Promise<{ ok: boolean }>
      reloadNavApp?: () => Promise<{ ok: boolean }>
      getNavAppPlayback?: () => Promise<{ playing: boolean }>
      setNavAppTheme?: (theme: string) => Promise<{ ok: boolean }>
      openAuthWindow?: (args: { partition: string; url: string; title?: string }) => Promise<{ ok: boolean }>
      onAuthClosed?: (cb: (partition: string) => void) => () => void
      onGoogleSignInNeeded?: (cb: (partition: string) => void) => () => void
      onEmbedSignInNeeded?: (cb: (partition: string) => void) => () => void
      onAuthExternalFallback?: (cb: (partition: string) => void) => () => void
      onNavAppRendererReady?: (cb: () => void) => () => void
      onOpenUrl?: (cb: (url: string) => void) => () => void
      getGuestPreloadPath?: () => Promise<string>
      importChromeCookies?: () => Promise<{
        ok: boolean
        imported: number
        skipped: number
        error?: string
      }>
      pickProjectFolder?: () => Promise<string | null>
      createProjectFolder?: (args: { name: string; parent?: string }) => Promise<string | null>
      openProjectInCursor?: (projectPath: string) => Promise<{ ok: boolean; error?: string }>
      showNotification?: (args: {
        title: string
        body: string
        proposalId?: string
      }) => Promise<{ ok: boolean }>
      onOpenAgentProposal?: (cb: (proposalId: string) => void) => () => void
    }
  }
}
