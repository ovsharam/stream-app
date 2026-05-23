export type Phase = 'idle' | 'pre_call' | 'live_call' | 'post_call'

export type SignalType =
  | 'blocker'
  | 'budget'
  | 'champion'
  | 'timeline'
  | 'technical'
  | 'motion'
  | 'risk'

export type DealContact = {
  id: string
  name: string
  title: string
  role: string
  last_interaction: string
  notes: string
}

export type DealSignal = {
  type: SignalType | string
  content: string
  source: string
  confidence: number
}

export type DealFixture = {
  id: string
  company: string
  stage: string
  acv: number
  seats: number
  close_target: string
  contacts: DealContact[]
  signals: DealSignal[]
  last_meeting: {
    date: string
    summary: string
    agreed_next_steps: string[]
  }
  talking_points: string[]
}

export type TranscriptEvent = {
  t: number
  speaker: string
  text: string
}

export type TriggerEvent = {
  t: number
  speaker: 'NOTCH_TRIGGER'
  signal_type: string
  signal_content: string
  generated_response?: string
  sources?: string[]
  urgency?: 'high' | 'medium' | 'low'
  signal_type_extracted?: string
  confidence?: number
}

export type CallEvent = TranscriptEvent | TriggerEvent

export type CallFixture = {
  id: string
  deal_id: string
  duration_seconds: number
  events: CallEvent[]
}

export type ScenarioFixture = {
  id: string
  active_deal_id: string
  call_id: string
  calendar_event: {
    title: string
    starts_in_minutes: number
    meeting_link: string
    attendees: string[]
  }
  replay_speed: number
  initial_phase: Phase
}

export type CalendarEvent = {
  title: string
  starts_in_minutes: number
  meeting_link: string
  attendees: string[]
}

export type CrossCasePattern = {
  dealId: string
  company: string
  content: string
}

export type PreCallPrep = {
  deal: DealFixture
  calendar: CalendarEvent
  talking_points: string[]
  context_note: string
  watch_out: string
  attendees: DealContact[]
  last_meeting_summary: string
  agreed_next_steps: string[]
  cross_case_patterns: CrossCasePattern[]
}

export type TechnicalQuestion = {
  question: string
  response: string
  sources: string[]
}

export type LoadBearingGap = {
  content: string
  urgency: 'high' | 'medium' | 'low'
}

export type ExtractedSignal = {
  type: string
  content: string
  confidence: number
  speaker?: string
}

export type PostCallSummary = {
  summary: string
  signals: ExtractedSignal[]
  actions: {
    type: string
    label: string
    status: 'ready' | 'queued' | 'applied'
  }[]
}

export type CallReplayCallbacks = {
  onTranscriptChunk: (speaker: string, text: string) => void
  onSignalDetected: (signal: ExtractedSignal) => void
  onTechnicalQuestion: (trigger: TechnicalQuestion) => void
  onLoadBearingGap: (gap: LoadBearingGap) => void
  onCallEnd: (summary: PostCallSummary) => void
}
