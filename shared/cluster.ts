import type { GraphRagContext } from './personal-kb'

export type DashboardTab = 'overview' | 'integrations' | 'meetings' | 'actions' | 'activity'

export type ClusterIntegration = {
  id: string
  name: string
  connected: boolean
  configured: boolean
  lastSync?: string
}

export type ClusterAction = {
  id: string
  type: 'email' | 'salesforce' | 'slack' | 'build' | 'graph'
  label: string
  status: 'ready' | 'queued' | 'applied'
  dealId: string
}

export type ClusterMeeting = {
  id: string
  title: string
  company: string
  startsInMinutes: number
  phase: 'pre_call' | 'live_call' | 'post_call' | 'idle'
  meetingLink?: string
}

export type GmailAccount = {
  id: string
  email: string
  feedEnabled: boolean
  calendarEnabled: boolean
  addedAt: number
}

export type MondayAccount = {
  id: string
  name: string
  email: string
}

export type GoogleCalendarOption = {
  id: string
  name: string
  primary?: boolean
  enabled: boolean
  accountId?: string
  accountEmail?: string
}

export type CalendarRailEvent = {
  id: string
  title: string
  timeLabel: string
  durationLabel: string
  kind: 'meet' | 'calendar'
  link?: string
  live: boolean
  ended?: boolean
  startsAt: number
  endsAt: number
  /** 0 = today, 1 = tomorrow, 2 = third day */
  dayIndex: number
  dayHeading: string
}

export type PerplexityNewsItem = {
  id: string
  title: string
  summary: string
  url?: string
  ts: number
}

export type PerplexityRailState = {
  connected: boolean
  accountEmail?: string
  news: PerplexityNewsItem[]
  error?: string
  updatedAt?: number
}

export type CalendarRailResponse = {
  events: CalendarRailEvent[]
  connected: boolean
  error?: string
  needsReconnect?: boolean
  perplexity?: PerplexityRailState
}

export type AssistResult = {
  query: string
  intent: 'say_this' | 'search' | 'agenda' | 'general'
  headline: string
  response: string
  sayThis: string
  sources: string[]
  agendaNext?: string
  trustNote?: string
  guideQuestions?: { text: string; why?: string; urgent?: boolean }[]
  autoDetected?: boolean
  triggerPhrase?: string
  /** Personal KB / GraphRAG-lite context for latent retrieval. */
  latentContext?: GraphRagContext
}

export type ClusterContext = {
  activeDeal: {
    id: string
    company: string
    stage: string
    acv: number
    healthScore: number
  }
  integrations: ClusterIntegration[]
  meeting: ClusterMeeting | null
  actions: ClusterAction[]
  recentSignals: { type: string; content: string; source: string }[]
  phase: string
}

export type ClusterSearchHit = {
  id: string
  title: string
  snippet: string
  source: string
  score: number
  /** Stream item id for navigation */
  itemId?: string
  day?: string
}

export type StreamSource =
  | 'notch'
  | 'meet'
  | 'gmail'
  | 'slack'
  | 'x'
  | 'monday'
  | 'discord'
  | 'github'
  | 'gdocs'
  | 'gong'
  | 'meeting'
  | 'salesforce'
  | 'build'
  | 'insight'
  | 'calcom'
  | 'linkedin'

export type StreamEventKind =
  | 'transcript_live'
  | 'transcript_done'
  | 'signal'
  | 'assist'
  | 'integration'
  | 'build_prompt'
  | 'insight'
  | 'action'

export type CentralStreamEvent = {
  id: string
  ts: number
  source: StreamSource
  kind: StreamEventKind
  title: string
  body: string
  highlight?: string
  promptPreview?: string
  meetingLink?: string
  joinable?: boolean
  speaker?: string
  meta?: Record<string, unknown>
}

export type ClusterThreadUpdate = {
  id: string
  ts: number
  actor: string
  body: string
  source: string
  /** Monday board automation vs human comment */
  kind?: 'activity' | 'comment'
}

export type MondayStatusOption = {
  index: number
  label: string
}

export type MondayRunResult = {
  ok: boolean
  message: string
  executed: string[]
  actions: { kind: 'comment' | 'move'; body?: string; statusLabel?: string }[]
}

export type MondayCreateResult = {
  ok: boolean
  itemId: string
  itemName: string
  boardId: string
  boardName: string
  groupTitle?: string
  taskUrl: string
}

export type ComposeActionResult = {
  ok: boolean
  provider: string
  message: string
  executed: string[]
}

export type MondayCreateTarget = {
  boardId: string
  boardName: string
  groupId?: string
  groupTitle?: string
}

export type ClusterThread = {
  itemId: string
  itemTitle: string
  day: string
  source?: 'monday' | 'gmail'
  threadId?: string
  accountId?: string
  boardId?: string
  boardName?: string
  taskUrl?: string
  statusColumnId?: string
  currentStatus?: string
  statusOptions?: MondayStatusOption[]
  canExecute?: boolean
  parent: ClusterThreadUpdate | null
  updates: ClusterThreadUpdate[]
}
