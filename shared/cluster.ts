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

export type AssistResult = {
  query: string
  intent: 'say_this' | 'search' | 'agenda' | 'general'
  headline: string
  response: string
  sayThis: string
  sources: string[]
  agendaNext?: string
  trustNote?: string
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
}

export type StreamSource =
  | 'notch'
  | 'meet'
  | 'gmail'
  | 'slack'
  | 'gong'
  | 'salesforce'
  | 'build'
  | 'insight'

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
  meta?: Record<string, string>
}
