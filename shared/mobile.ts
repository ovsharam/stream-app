export type ContextChipType = 'live' | 'warn' | 'ok' | 'soft' | 'neutral'

export type ContextChip = {
  id: string
  type: ContextChipType
  content: string
}

export type GuideQuestion = {
  text: string
  why?: string
  urgent?: boolean
}

export type MobileAgenda = {
  current: string
  remaining: string[]
  callGoal: string
}

export type MobileCallPhase = 'idle' | 'pre_call' | 'live_call' | 'post_call'

export type MobileContext = {
  phase: MobileCallPhase
  dealName: string
  dealId: string
  meetingTitle?: string
  elapsed?: string
  ambientListening: boolean
  objective: 'discovery' | 'v1_ship'
  chips: ContextChip[]
  agenda: MobileAgenda | null
  recentTranscript: { speaker: string; text: string }[]
  objectiveNote: string
}
