import { randomUUID } from 'crypto'
import type { OperatorEvent, OperatorEventType } from '../../shared/operator-events'
import type {
  IntentionEpisode,
  IntentionEpisodeOutcome
} from '../../shared/intention-episode'
import { reactionTierFromMs } from '../../shared/intention-episode'
import { inferIntention } from '../kb/intention'
import { getDatapoint } from '../kb/store'

const ENGAGEMENT_DEPTH = 2
const EPISODE_IDLE_MS = 15 * 60_000

const DEPTH_FLOOR: Partial<Record<OperatorEventType, number>> = {
  feed_impression: 0,
  feed_dwell: 1,
  feed_vote: 1,
  feed_context_select: 2,
  feed_thread_open: 2,
  compose_start: 3,
  compose_submit: 4,
  agent_proposal_created: 3,
  agent_brief_ready: 2,
  agent_proposal_approved: 4,
  agent_proposal_rejected: 4,
  meeting_start: 2,
  meeting_end: 3,
  task_session_start: 2,
  task_session_end: 2,
  nav_change: 0,
  panel_toggle: 0
}

function itemIdFromPayload(payload: Record<string, unknown>): string | undefined {
  const raw = payload.itemId ?? payload.eventId ?? payload.contextItemId
  return raw != null ? String(raw).replace(/^ext-/, '') : undefined
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function computeBehavioralWeight(input: {
  depth: number
  reactionMs?: number
  outcome?: IntentionEpisodeOutcome
}): number {
  const depthWeight = input.depth / 4
  const speedWeight =
    input.reactionMs != null
      ? clamp(1 - input.reactionMs / 60_000, 0.15, 1)
      : input.depth >= ENGAGEMENT_DEPTH
        ? 0.45
        : 0.25
  const outcomeWeight =
    input.outcome === 'committed'
      ? 1
      : input.outcome === 'engaged'
        ? 0.55
        : input.outcome === 'rejected'
          ? 0.35
          : input.outcome === 'abandoned'
            ? 0.2
            : 0.15
  return clamp(0.4 * depthWeight + 0.3 * speedWeight + 0.3 * outcomeWeight, 0, 1)
}

function stimulusKeyForEvent(event: OperatorEvent): string | null {
  const itemId = itemIdFromPayload(event.payload)
  if (
    itemId &&
    [
      'feed_impression',
      'feed_dwell',
      'feed_vote',
      'feed_context_select',
      'feed_thread_open',
      'compose_start',
      'compose_submit',
      'task_session_start',
      'task_session_end'
    ].includes(event.type)
  ) {
    return `item:${itemId}`
  }

  if (event.type.startsWith('agent_')) {
    const proposalId =
      event.subjectId ??
      (event.payload.proposalId != null ? String(event.payload.proposalId) : undefined) ??
      event.correlationId
    if (proposalId) return `proposal:${proposalId}`
  }

  if (event.type === 'meeting_start' || event.type === 'meeting_end') {
    const sessionId = String(event.payload.sessionId ?? event.subjectId ?? '')
    if (sessionId) return `meeting:${sessionId}`
  }

  if (event.type === 'compose_start' && !itemId) {
    return `compose:${event.sessionId}`
  }

  return null
}

function appendChain(chain: string[], step: string): string[] {
  if (chain.length > 0 && chain[chain.length - 1] === step) return chain
  return [...chain, step]
}

function labelForItem(itemId: string, source?: string): string | undefined {
  const dp = getDatapoint(`dp-${itemId}`)
  if (dp?.title) return dp.title.slice(0, 120)
  if (dp?.body) return dp.body.slice(0, 120)
  if (source) return `${source} · ${itemId.slice(0, 10)}`
  return undefined
}

function closeOutcome(
  episode: IntentionEpisode,
  terminal: OperatorEventType,
  payload: Record<string, unknown>
): IntentionEpisodeOutcome {
  if (terminal === 'compose_submit') {
    return payload.ok === false ? 'rejected' : 'committed'
  }
  if (terminal === 'agent_proposal_approved') return 'committed'
  if (terminal === 'agent_proposal_rejected') return 'rejected'
  if (terminal === 'task_session_end') {
    if (episode.eventChain.includes('compose_start') && !episode.eventChain.includes('compose_submit')) {
      return 'abandoned'
    }
    return episode.commitmentDepth >= ENGAGEMENT_DEPTH ? 'engaged' : 'ignored'
  }
  if (terminal === 'meeting_end') {
    return episode.commitmentDepth >= 3 ? 'committed' : 'engaged'
  }
  return episode.commitmentDepth >= ENGAGEMENT_DEPTH ? 'engaged' : 'ignored'
}

function isTerminalEvent(type: OperatorEventType): boolean {
  return [
    'compose_submit',
    'agent_proposal_approved',
    'agent_proposal_rejected',
    'task_session_end',
    'meeting_end'
  ].includes(type)
}

export class EpisodeEngine {
  private open = new Map<string, IntentionEpisode>()

  loadOpen(episodes: IntentionEpisode[]): void {
    this.open.clear()
    for (const ep of episodes) {
      if (ep.status === 'open') {
        this.open.set(episodeMapKey(ep), ep)
      }
    }
  }

  getOpenEpisodes(): IntentionEpisode[] {
    return [...this.open.values()]
  }

  processEvents(events: OperatorEvent[], opts?: { historical?: boolean }): IntentionEpisode[] {
    const sorted = [...events].sort((a, b) => a.ts - b.ts)
    const emitted: IntentionEpisode[] = []
    for (const event of sorted) {
      const updated = this.processOne(event, { live: !opts?.historical })
      if (updated) emitted.push(updated)
    }
    if (opts?.historical) {
      emitted.push(...this.finalizeOpenEpisodes())
    }
    return emitted
  }

  finalizeOpenEpisodes(): IntentionEpisode[] {
    const closed: IntentionEpisode[] = []
    for (const ep of this.open.values()) {
      ep.status = 'closed'
      ep.endedAt = ep.lastEventAt ?? ep.startedAt
      ep.outcome =
        ep.eventChain.includes('compose_start') && !ep.eventChain.includes('compose_submit')
          ? 'abandoned'
          : ep.commitmentDepth >= ENGAGEMENT_DEPTH
            ? 'engaged'
            : 'ignored'
      ep.behavioralWeight = computeBehavioralWeight({
        depth: ep.commitmentDepth,
        reactionMs: ep.latencies.reactionMs,
        outcome: ep.outcome
      })
      closed.push({ ...ep })
    }
    this.open.clear()
    return closed
  }

  processOne(event: OperatorEvent, opts?: { live?: boolean }): IntentionEpisode | null {
    const key = stimulusKeyForEvent(event)
    if (!key) return null

    const [kind, id] = key.split(':') as [string, string]
    const mapKey = key
    let episode = this.open.get(mapKey)

    if (!episode) {
      episode = this.createEpisode(event, kind, id)
      this.open.set(mapKey, episode)
    }

    episode.eventChain = appendChain(episode.eventChain, event.type)
    episode.eventIds.push(event.id)
    episode.lastEventAt = event.ts
    episode.correlationId = event.correlationId ?? episode.correlationId
    episode.commitmentDepth = Math.max(
      episode.commitmentDepth,
      DEPTH_FLOOR[event.type] ?? episode.commitmentDepth
    )

    const itemId = itemIdFromPayload(event.payload)
    if (itemId && event.payload.source) {
      episode.stimulusSource = String(event.payload.source)
    }

    if (event.type === 'feed_dwell') {
      const dwell = Number(event.payload.durationMs)
      if (Number.isFinite(dwell)) {
        episode.latencies.dwellMs = (episode.latencies.dwellMs ?? 0) + dwell
      }
    }

    if (
      episode.latencies.reactionMs == null &&
      episode.commitmentDepth >= ENGAGEMENT_DEPTH &&
      event.ts >= episode.startedAt
    ) {
      episode.latencies.reactionMs = event.ts - episode.startedAt
      episode.reactionTier = reactionTierFromMs(episode.latencies.reactionMs)
    }

    if (event.type === 'compose_submit') {
      const tta = Number(event.payload.timeToActionMs)
      if (Number.isFinite(tta) && tta > 0) {
        episode.latencies.commitmentMs = tta
      } else {
        episode.latencies.commitmentMs = event.ts - episode.startedAt
      }
      const cmd = String(event.payload.rawCommand ?? event.payload.intent ?? '')
      if (cmd) {
        episode.textIntention = inferIntention(cmd)
        episode.dominantIntention = episode.textIntention.dominant
      }
    }

    if (isTerminalEvent(event.type)) {
      episode.status = 'closed'
      episode.endedAt = event.ts
      episode.outcome = closeOutcome(episode, event.type, event.payload)
      if (episode.latencies.commitmentMs == null) {
        episode.latencies.commitmentMs = event.ts - episode.startedAt
      }
      episode.behavioralWeight = computeBehavioralWeight({
        depth: episode.commitmentDepth,
        reactionMs: episode.latencies.reactionMs,
        outcome: episode.outcome
      })
      this.open.delete(mapKey)
      return { ...episode }
    }

    episode.behavioralWeight = computeBehavioralWeight({
      depth: episode.commitmentDepth,
      reactionMs: episode.latencies.reactionMs,
      outcome: episode.outcome
    })

    if (
      opts?.live &&
      Date.now() - event.ts < 60_000 &&
      Date.now() - event.ts > EPISODE_IDLE_MS &&
      episode.status === 'open'
    ) {
      episode.status = 'closed'
      episode.endedAt = event.ts
      episode.outcome =
        episode.commitmentDepth >= ENGAGEMENT_DEPTH ? 'engaged' : 'ignored'
      episode.behavioralWeight = computeBehavioralWeight({
        depth: episode.commitmentDepth,
        reactionMs: episode.latencies.reactionMs,
        outcome: episode.outcome
      })
      this.open.delete(mapKey)
      return { ...episode }
    }

    return null
  }

  recordDirect(input: {
    operatorId: string
    sessionId: string
    stimulusType: IntentionEpisode['stimulusType']
    stimulusId: string
    stimulusSource?: string
    stimulusLabel?: string
    correlationId?: string
    startedAt: number
    endedAt: number
    eventChain: string[]
    outcome: IntentionEpisodeOutcome
    reactionMs?: number
    commitmentMs?: number
    text?: string
    depth?: number
  }): IntentionEpisode {
    const textIntention = input.text ? inferIntention(input.text) : undefined
    const depth = input.depth ?? (input.outcome === 'committed' ? 4 : 2)
    const episode: IntentionEpisode = {
      id: `ep-${randomUUID()}`,
      operatorId: input.operatorId,
      sessionId: input.sessionId,
      correlationId: input.correlationId,
      stimulusType: input.stimulusType,
      stimulusId: input.stimulusId,
      stimulusSource: input.stimulusSource,
      stimulusLabel: input.stimulusLabel,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      lastEventAt: input.endedAt,
      status: 'closed',
      outcome: input.outcome,
      eventChain: input.eventChain,
      eventIds: [],
      latencies: {
        reactionMs: input.reactionMs,
        commitmentMs: input.commitmentMs ?? input.endedAt - input.startedAt
      },
      commitmentDepth: depth,
      behavioralWeight: computeBehavioralWeight({
        depth,
        reactionMs: input.reactionMs,
        outcome: input.outcome
      }),
      reactionTier: reactionTierFromMs(input.reactionMs),
      textIntention,
      dominantIntention: textIntention?.dominant
    }
    return episode
  }

  private createEpisode(event: OperatorEvent, keyKind: string, stimulusId: string): IntentionEpisode {
    const itemId = itemIdFromPayload(event.payload)
    const source =
      event.payload.source != null
        ? String(event.payload.source)
        : event.surface
    return {
      id: `ep-${randomUUID()}`,
      operatorId: event.operatorId,
      sessionId: event.sessionId,
      correlationId: event.correlationId,
      stimulusType:
        keyKind === 'item'
          ? 'stream_item'
          : keyKind === 'proposal'
            ? 'agent_proposal'
            : keyKind === 'compose'
              ? 'compose'
              : 'meeting',
      stimulusId: keyKind === 'item' && itemId ? itemId : stimulusId,
      stimulusSource: source,
      stimulusLabel:
        keyKind === 'item' && itemId ? labelForItem(itemId, source) : undefined,
      startedAt: event.ts,
      lastEventAt: event.ts,
      status: 'open',
      eventChain: [],
      eventIds: [],
      latencies: {},
      commitmentDepth: 0,
      behavioralWeight: 0.1
    }
  }
}

export const episodeEngine = new EpisodeEngine()

function episodeMapKey(ep: IntentionEpisode): string {
  if (ep.stimulusType === 'stream_item') return `item:${ep.stimulusId}`
  if (ep.stimulusType === 'agent_proposal') return `proposal:${ep.stimulusId}`
  if (ep.stimulusType === 'compose') return `compose:${ep.sessionId}`
  if (ep.stimulusType === 'meeting' || ep.stimulusType === 'meeting_signal') {
    return `meeting:${ep.stimulusId}`
  }
  return `${ep.stimulusType}:${ep.stimulusId}`
}
