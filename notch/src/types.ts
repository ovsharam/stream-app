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
    }
  }
}

export {}
