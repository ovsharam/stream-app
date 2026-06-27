import type { FdeEngagement } from '@shared/fde-engagement'

/** Stable short reference for cards — derived from engagement id, not seeded demo data. */
export function engagementRef(engagement: Pick<FdeEngagement, 'id' | 'createdAt'>): string {
  const tail = engagement.id.replace(/-/g, '').slice(-6).toUpperCase()
  const year = new Date(engagement.createdAt).getFullYear().toString().slice(-2)
  return `FDE-${year}${tail}`
}

export function formatEngagementValue(scope: FdeEngagement['scope']): string | null {
  if (scope === 'big_bet') return 'Enterprise'
  if (scope === 'quick_win') return 'Quick win'
  return null
}
