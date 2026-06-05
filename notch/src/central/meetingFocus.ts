import type { CentralStreamEvent } from '@shared/cluster'

export function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

export function meetingEventByItemId(
  events: CentralStreamEvent[],
  itemId: string | null
): CentralStreamEvent | null {
  if (!itemId) return null
  const bare = itemId.replace(/^ext-/, '')
  return (
    events.find(
      (e) => e.source === 'meeting' && streamItemId(e) === bare
    ) ?? null
  )
}
