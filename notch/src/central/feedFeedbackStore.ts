import type { FeedSignalRating } from '@shared/telemetry'

const STORAGE_KEY = 'notch.feedFeedback'

/** Signal quality rating — replaces binary up/down. */
export type FeedVote = FeedSignalRating | null

type FeedbackMap = Record<string, FeedVote>

function load(): FeedbackMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as FeedbackMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function save(map: FeedbackMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function getFeedVote(eventId: string): FeedVote {
  return load()[eventId] ?? null
}

export function setFeedVote(eventId: string, vote: FeedVote): FeedVote {
  const map = load()
  const current = map[eventId] ?? null
  const next = current === vote ? null : vote
  if (next) map[eventId] = next
  else delete map[eventId]
  save(map)
  return next
}
