/** Hand-tuned feed ranker weights — tune without redeploying ranker logic. */
export const RANK_WEIGHTS = {
  urgency: 0.28,
  intention: 0.18,
  graphSalience: 0.22,
  engagementPrior: 0.15,
  freshness: 0.12,
  penalty: 1
} as const

export function feedRankingEnabled(): boolean {
  return process.env.FEED_RANKING !== '0'
}

export function feedRankDebug(): boolean {
  return process.env.FEED_RANK_DEBUG === '1'
}
