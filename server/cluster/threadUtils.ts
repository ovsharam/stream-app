import type { ClusterThreadUpdate } from '../../shared/cluster'

/** Board/status automation vs human comment on a Monday item. */
export function classifyMondayUpdate(body: string, actor: string): 'activity' | 'comment' {
  const b = body.trim()
  const a = actor.trim().toLowerCase()
  if (/^item (updated|moved) on board/i.test(b)) return 'activity'
  if (/^status changed on/i.test(b)) return 'activity'
  if (/^item moved ·/i.test(b)) return 'activity'
  if (a === 'monday' && /^(item|status)/i.test(b)) return 'activity'
  return 'comment'
}

export function toThreadUpdate(input: {
  id: string
  ts: number
  actor: string
  body: string
  source: string
}): ClusterThreadUpdate {
  const kind =
    input.source === 'monday'
      ? classifyMondayUpdate(input.body, input.actor)
      : 'comment'
  return { ...input, kind }
}
