/**
 * Safe wrappers — training capture must never break the live FDE workflow.
 */

import type { StarMomentReason } from '../../shared/fde-training'
import type { MeetingExtraction, MeetingSession } from '../cluster/meetingPipeline'
import type { FdeEngagement } from '../../shared/fde-engagement'

function trainingEnabled(): boolean {
  return process.env.FDE_TRAINING_DISABLED !== '1'
}

function safeRun(fn: () => void): void {
  if (!trainingEnabled()) return
  try {
    fn()
  } catch (e) {
    console.warn('[fde-training] capture failed:', (e as Error).message)
  }
}

export function captureTranscriptChunk(
  sessionId: string,
  chunkIndex: number,
  text: string,
  ts: number
): void {
  safeRun(() => {
    const { upsertTranscriptChunk } = require('./trainingStore') as typeof import('./trainingStore')
    upsertTranscriptChunk({ sessionId, chunkIndex, text, ts })
  })
}

export function captureMeetingSignal(input: {
  sessionId: string
  type: string
  text: string
  chunkIndex?: number
  ts: number
}): void {
  safeRun(() => {
    const store = require('./trainingStore') as typeof import('./trainingStore')
    const { meetingSignalToActivity } =
      require('../dashboard/activity') as typeof import('../dashboard/activity')
    const { emitDashboardActivity } =
      require('../dashboard/broadcast') as typeof import('../dashboard/broadcast')
    const signal = store.insertMeetingSignal(input)
    const meeting = store.getMeetingRecord(input.sessionId)
    emitDashboardActivity(meetingSignalToActivity(signal, meeting?.title))
    const { recordMeetingSignalEpisode } =
      require('../intention/service') as typeof import('../intention/service')
    recordMeetingSignalEpisode({
      sessionId: input.sessionId,
      signalId: signal.id,
      signalType: input.type,
      text: input.text,
      ts: input.ts,
      meetingTitle: meeting?.title
    })
  })
}

export function captureStarredMoment(input: {
  sessionId: string
  text: string
  predictionId?: string
  reason?: StarMomentReason
  ts: number
}): void {
  safeRun(() => {
    const store = require('./trainingStore') as typeof import('./trainingStore')
    const { starredMomentToActivity } =
      require('../dashboard/activity') as typeof import('../dashboard/activity')
    const { emitDashboardActivity } =
      require('../dashboard/broadcast') as typeof import('../dashboard/broadcast')
    const moment = store.insertStarredMoment(input)
    const meeting = store.getMeetingRecord(input.sessionId)
    emitDashboardActivity(starredMomentToActivity(moment, meeting?.title))
    const { recordStarredMomentEpisode } =
      require('../intention/service') as typeof import('../intention/service')
    recordStarredMomentEpisode({
      sessionId: input.sessionId,
      momentId: moment.id,
      text: input.text,
      ts: input.ts,
      meetingTitle: meeting?.title
    })
  })
}

export function captureAssistPrediction(input: {
  id: string
  sessionId: string
  signalText: string
  sayThis: string
  followUp?: string
  flag?: string
  ts: number
}): void {
  safeRun(() => {
    const store = require('./trainingStore') as typeof import('./trainingStore')
    const { assistPredictionToActivity } =
      require('../dashboard/activity') as typeof import('../dashboard/activity')
    const { emitDashboardActivity } =
      require('../dashboard/broadcast') as typeof import('../dashboard/broadcast')
    const prediction = store.insertAssistPrediction(input)
    emitDashboardActivity(assistPredictionToActivity(prediction))
  })
}

export function captureMeetingStart(session: MeetingSession): void {
  safeRun(() => {
    const { insertDecisionEvent } = require('./trainingStore') as typeof import('./trainingStore')
    insertDecisionEvent({
      sessionId: session.id,
      phase: 'discovery',
      type: 'meeting_started',
      humanAction: session.title ?? 'Live capture',
      metadata: { dealHint: session.dealHint }
    })
  })
}

export function captureMeetingEnd(input: {
  session: MeetingSession
  engagementId?: string
  transcript: string
  durationMs: number
  extraction: MeetingExtraction
}): void {
  safeRun(() => {
    const store = require('./trainingStore') as typeof import('./trainingStore')
    store.finalizeMeetingRecord({
      session: input.session,
      engagementId: input.engagementId,
      transcript: input.transcript,
      durationMs: input.durationMs
    })
    const decision = store.insertDecisionEvent({
      sessionId: input.session.id,
      engagementId: input.engagementId,
      phase: 'post_call',
      type: 'meeting_ended',
      metadata: {
        chunkCount: input.session.chunks.length,
        signalCount: input.session.signals.length,
        starredCount: input.session.starred.length
      }
    })
    const { meetingEndedToActivity, decisionEventToActivity } =
      require('../dashboard/activity') as typeof import('../dashboard/activity')
    const { emitDashboardActivity } =
      require('../dashboard/broadcast') as typeof import('../dashboard/broadcast')
    const record = store.getMeetingRecord(input.session.id)
    if (record) emitDashboardActivity(meetingEndedToActivity(record))
    if (decision) emitDashboardActivity(decisionEventToActivity(decision))
  })
}

export function captureEngagementUpsert(input: {
  previous: FdeEngagement | null
  next: FdeEngagement
  sessionId?: string
  extraction?: MeetingExtraction
}): void {
  safeRun(() => {
    const store = require('./trainingStore') as typeof import('./trainingStore')
    if (input.sessionId) {
      store.linkMeetingToEngagement(input.sessionId, input.next.id)
    }

    const prev = input.previous
    const changed =
      !prev ||
      prev.summary !== input.next.summary ||
      prev.buildPrompt !== input.next.buildPrompt ||
      prev.scope !== input.next.scope ||
      JSON.stringify(prev.nextSteps) !== JSON.stringify(input.next.nextSteps) ||
      JSON.stringify(prev.flags) !== JSON.stringify(input.next.flags) ||
      JSON.stringify(prev.openQuestions) !== JSON.stringify(input.next.openQuestions)

    if (changed && input.extraction) {
      const revision = store.insertExtractionRevision({
        sessionId: input.sessionId,
        engagementId: input.next.id,
        source: prev ? 'fde_edit' : 'auto',
        extraction: input.extraction
      })
      if (!prev) {
        store.insertDecisionEvent({
          engagementId: input.next.id,
          sessionId: input.sessionId,
          phase: 'post_call',
          type: 'extraction_auto',
          inputRef: revision.id,
          humanAction: input.extraction.scopeDecision,
          metadata: {
            flagCount: input.extraction.flags.length,
            questionCount: input.extraction.questions.length
          }
        })
      } else {
        store.insertDecisionEvent({
          engagementId: input.next.id,
          sessionId: input.sessionId,
          phase: 'post_call',
          type: 'extraction_edited',
          inputRef: revision.id,
          autoSuggestion: prev.buildPrompt?.slice(0, 400),
          humanAction: input.next.buildPrompt?.slice(0, 400),
          metadata: { version: revision.version }
        })
      }
    } else if (
      prev &&
      (prev.summary !== input.next.summary ||
        prev.buildPrompt !== input.next.buildPrompt ||
        prev.scope !== input.next.scope)
    ) {
      store.insertExtractionRevision({
        sessionId: input.sessionId,
        engagementId: input.next.id,
        source: 'fde_edit',
        extraction: {
          summary: input.next.summary ?? '',
          buildPrompt: input.next.buildPrompt ?? '',
          nextSteps: input.next.nextSteps,
          flags: input.next.flags,
          decisions: [],
          questions: input.next.openQuestions,
          scopeDecision: input.next.scope
        }
      })
    }

    if (prev && prev.stage !== input.next.stage) {
      store.logEngagementStageChange({
        engagementId: input.next.id,
        fromStage: prev.stage,
        toStage: input.next.stage,
        scope: input.next.scope
      })
    }

    if (prev && prev.escalationLevel !== input.next.escalationLevel) {
      store.logEngagementEscalation({
        engagementId: input.next.id,
        level: input.next.escalationLevel
      })
    }
  })
}

export function captureAssistInvocation(input: {
  engagementId?: string
  sessionId?: string
  surface: 'mobile' | 'chat' | 'stream'
  query: string
  predictionId?: string
  suggestion?: string
  response?: string
  pageContext?: { url?: string; title?: string; excerpt?: string }
}): void {
  safeRun(() => {
    const { insertAssistInvocation } = require('./trainingStore') as typeof import('./trainingStore')
    insertAssistInvocation(input)
  })
}

export function captureBuildRun(input: {
  engagementId?: string
  executor: string
  prompt: string
  ok: boolean
  trace?: Record<string, unknown>
  startedAt: number
}): void {
  safeRun(() => {
    const { insertBuildRun } = require('./trainingStore') as typeof import('./trainingStore')
    const executor = (
      ['cursor', 'mcp_agent', 'monday', 'gmail', 'slack', 'claude', 'gemini', 'perplexity'].includes(
        input.executor
      )
        ? input.executor
        : 'other'
    ) as import('../../shared/fde-training').BuildRunExecutor
    insertBuildRun({
      engagementId: input.engagementId,
      executor,
      prompt: input.prompt,
      status: input.ok ? 'succeeded' : 'failed',
      trace: input.trace,
      startedAt: input.startedAt
    })
    if (input.engagementId) {
      const { insertDecisionEvent } = require('./trainingStore') as typeof import('./trainingStore')
      insertDecisionEvent({
        engagementId: input.engagementId,
        phase: 'build',
        type: 'compose_executed',
        humanAction: input.prompt.slice(0, 500),
        outcome: input.ok ? 'succeeded' : 'failed',
        metadata: { executor: input.executor }
      })
    }
  })
}

export function captureMeetingActionApproved(input: {
  engagementId?: string
  itemId: string
  actionId: string
  actionKind?: string
}): void {
  safeRun(() => {
    const { insertDecisionEvent } = require('./trainingStore') as typeof import('./trainingStore')
    insertDecisionEvent({
      engagementId: input.engagementId,
      phase: 'post_call',
      type: 'meeting_action_approved',
      inputRef: input.actionId,
      humanAction: input.actionKind ?? 'approve',
      metadata: { itemId: input.itemId }
    })
  })
}

export function captureScopeApproved(input: { engagementId: string }): void {
  safeRun(() => {
    const { insertDecisionEvent } = require('./trainingStore') as typeof import('./trainingStore')
    insertDecisionEvent({
      engagementId: input.engagementId,
      phase: 'post_call',
      type: 'scope_approved',
      outcome: 'approved'
    })
  })
}

export function captureFeedback(input: {
  engagementId: string
  source: import('../../shared/fde-training').FeedbackSource
  feedbackType: import('../../shared/fde-training').FeedbackType
  text: string
  requirementId?: string
  buildRunId?: string
}): void {
  safeRun(() => {
    const { insertFeedbackEvent, insertDecisionEvent } =
      require('./trainingStore') as typeof import('./trainingStore')
    insertFeedbackEvent(input)
    insertDecisionEvent({
      engagementId: input.engagementId,
      phase: 'feedback',
      type: 'feedback_received',
      humanAction: input.text.slice(0, 500),
      metadata: { feedbackType: input.feedbackType, source: input.source }
    })
  })
}
