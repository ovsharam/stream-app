/**
 * FDE Decision Scorer — quick-win vs big-bet
 *
 * NOT a custom trained model (Phase 1–2).
 * Hybrid architecture:
 *   1. Feature extraction (deterministic, auditable)
 *   2. Weighted score → preliminary bet size
 *   3. Optional LLM layer for rationale + recommended quick-win (Claude/API)
 *
 * Custom fine-tune only makes sense once you have 500+ labeled deals
 * with outcomes (closed_won/lost, time-to-close, pilot conversion).
 */

import type { BetSize, Case, Signal } from '../../shared/graph'

export type FdeScoreFeatures = {
  complianceBlockers: number
  technicalComplexity: number
  customBuildSignals: number
  budgetConfirmed: number
  championIdentified: number
  integrationSurface: number
  timelinePressure: number
  stalledDays: number
  signalCoverage: number
}

export type FdeScoreResult = {
  betSize: BetSize
  confidence: number // 0–1
  quickWinScore: number // 0–100
  bigBetScore: number // 0–100
  features: FdeScoreFeatures
  rationale: string[]
  recommendedQuickWin?: string
  recommendedNextQuestion?: string
}

const QUICK_WIN_KEYWORDS = [
  'pilot',
  'quick win',
  'support automation',
  'single workflow',
  'one use case',
  '30 day',
  '2 week'
]

const BIG_BET_KEYWORDS = [
  'custom mcp',
  'multi-tenant',
  'enterprise rollout',
  'full platform',
  'agent platform',
  'integration across',
  'sso',
  'compliance review',
  'legal gate',
  'data residency'
]

export function extractFeatures(case_: Case, signals: Signal[]): FdeScoreFeatures {
  const text = signals.map((s) => `${s.token} ${s.excerpt}`).join(' ').toLowerCase()

  const complianceBlockers = signals.filter(
    (s) => s.type === 'compliance' || s.type === 'blocker'
  ).length

  const technicalComplexity = signals.filter((s) => s.type === 'technical').length

  const customBuildSignals = BIG_BET_KEYWORDS.filter((k) => text.includes(k)).length

  const budgetConfirmed = signals.some((s) => s.type === 'budget') ? 1 : 0

  const championIdentified = signals.some((s) => s.type === 'champion') ? 1 : 0

  const integrationSurface = new Set(signals.map((s) => s.source)).size

  const timelinePressure = signals.some((s) => s.type === 'timeline') ? 1 : 0

  const stalledDays = (case_.metadata.stalledDays as number | undefined) ?? 0

  const signalCoverage = Math.min(100, signals.length * 12) / 100

  return {
    complianceBlockers,
    technicalComplexity,
    customBuildSignals,
    budgetConfirmed,
    championIdentified,
    integrationSurface,
    timelinePressure,
    stalledDays,
    signalCoverage
  }
}

/**
 * Deterministic scorer — same inputs always produce same scores.
 * Tune weights from FDE interviews, not ML.
 */
export function scoreFdeDecision(case_: Case, signals: Signal[]): FdeScoreResult {
  const f = extractFeatures(case_, signals)

  let bigBetScore = 0
  let quickWinScore = 0
  const rationale: string[] = []

  bigBetScore += f.customBuildSignals * 18
  bigBetScore += f.complianceBlockers * 14
  bigBetScore += f.technicalComplexity * 12
  bigBetScore += f.integrationSurface * 8
  if (case_.amount && case_.amount > 150_000) {
    bigBetScore += 15
    rationale.push(`Deal size $${(case_.amount / 1000).toFixed(0)}K suggests enterprise scope`)
  }

  quickWinScore += f.championIdentified * 20
  quickWinScore += f.budgetConfirmed * 15
  quickWinScore += f.timelinePressure * 10
  quickWinScore += f.signalCoverage * 20

  const text = signals.map((s) => s.excerpt.toLowerCase()).join(' ')
  if (QUICK_WIN_KEYWORDS.some((k) => text.includes(k))) {
    quickWinScore += 25
    rationale.push('Customer language points to bounded pilot / quick win')
  }

  if (f.stalledDays > 14) {
    bigBetScore += 10
    rationale.push(`Deal stalled ${f.stalledDays}d — likely blocked on big-bet prerequisite`)
  }

  if (f.complianceBlockers > 0) {
    rationale.push('Compliance/blocker signals present — big-bet path unless quick legal win exists')
  }

  bigBetScore = Math.min(100, bigBetScore)
  quickWinScore = Math.min(100, quickWinScore)

  let betSize: BetSize = 'unknown'
  const margin = Math.abs(bigBetScore - quickWinScore)

  if (margin < 12) {
    betSize = 'unknown'
    rationale.push('Scores too close — need one more discovery question')
  } else if (bigBetScore > quickWinScore) {
    betSize = 'big_bet'
  } else {
    betSize = 'quick_win'
  }

  const confidence = Math.min(0.95, 0.45 + margin / 100)

  let recommendedQuickWin: string | undefined
  if (betSize === 'big_bet' || betSize === 'unknown') {
    if (f.complianceBlockers > 0) {
      recommendedQuickWin =
        'Send DPA + SCC package within 48h (NovaBank playbook) while scoping full build'
    } else if (f.technicalComplexity > 0) {
      recommendedQuickWin =
        'Propose 2-week MCP pilot on single workflow (e.g. support triage) before platform scope'
    } else {
      recommendedQuickWin =
        'Offer bounded pilot with clear success metric before full agent platform commitment'
    }
  }

  const recommendedNextQuestion =
    betSize === 'big_bet'
      ? 'Who owns legal/security sign-off, and what is the minimum doc set to unblock a pilot?'
      : 'What single workflow would prove ROI in 30 days if we shipped next week?'

  return {
    betSize,
    confidence,
    quickWinScore,
    bigBetScore,
    features: f,
    rationale,
    recommendedQuickWin,
    recommendedNextQuestion
  }
}

/**
 * Phase 3: optional LLM enrichment — pass features + signals, get narrative.
 * Uses Claude/GPT with structured JSON output; NOT a custom model.
 */
export async function enrichScoreWithLlm(
  result: FdeScoreResult,
  case_: Case,
  signals: Signal[],
  llmCall: (prompt: string) => Promise<string>
): Promise<FdeScoreResult> {
  const prompt = `You are an FDE advisor. Given deal features and signals, refine the quick-win recommendation in 2 sentences max.
Case: ${case_.name}
Bet size: ${result.betSize}
Features: ${JSON.stringify(result.features)}
Top signals: ${signals.slice(0, 5).map((s) => s.token).join(', ')}
Current recommendation: ${result.recommendedQuickWin ?? 'none'}`

  try {
    const enriched = await llmCall(prompt)
    return {
      ...result,
      recommendedQuickWin: enriched.trim() || result.recommendedQuickWin
    }
  } catch {
    return result
  }
}
