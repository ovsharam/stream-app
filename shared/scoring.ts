import type { BetSize } from './graph'

export type FdeScoreResult = {
  betSize: BetSize
  confidence: number
  quickWinScore: number
  bigBetScore: number
  rationale: string[]
  recommendedQuickWin?: string
  recommendedNextQuestion?: string
}

export type BrowserContext = {
  url: string
  hostname: string
  title: string
  entityType?: string
  entityHint?: string
  selectedText?: string
  timestamp: string
}
