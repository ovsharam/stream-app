import type { ExtractedSignal, LoadBearingGap, Phase, PostCallSummary, PreCallPrep, TechnicalQuestion } from '../simulation/types'

export type NotchStatePayload = {
  phase: Phase
  prep: PreCallPrep | null
  live: {
    transcript: { speaker: string; text: string }[]
    liveAnswer: TechnicalQuestion | null
    loadBearing: LoadBearingGap[]
    signals: ExtractedSignal[]
    checkedPoints: number[]
  }
  postCall: PostCallSummary | null
  searchOpen: boolean
  callActive: boolean
  simulationMode: boolean
}

declare global {
  interface Window {
    notch: {
      getState: () => Promise<NotchStatePayload>
      onState: (cb: (state: NotchStatePayload) => void) => () => void
      togglePoint: (idx: number) => void
      closeSearch: () => void
      startCall: () => void
      endCall: () => void
      loadPreCall: () => void
      expand?: () => void
      collapse?: () => void
      hide?: () => void
      chat?: () => void
      getMode?: () => Promise<string>
      onMode?: (cb: (mode: string) => void) => (() => void) | undefined
      onSimRefresh?: (cb: () => void) => (() => void) | undefined
      onFocusSearch?: (cb: () => void) => (() => void) | undefined
      meeting?: {
        onStarted?: (cb: (sessionId: string) => void) => (() => void) | undefined
        onEnded?: (cb: (result?: unknown) => void) => (() => void) | undefined
        onChunk?: (cb: () => void) => (() => void) | undefined
        onSignal?: (cb: () => void) => (() => void) | undefined
        start?: () => Promise<void>
        end?: () => Promise<void>
        star?: () => Promise<void>
      }
      audio?: {
        status?: () => Promise<{ whisperReady: boolean; [key: string]: unknown }>
      }
    }
  }
}

export {}
