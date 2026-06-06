/**
 * Meeting Intelligence pipeline.
 *
 * Live: tracks chunks/signals/predictions in-memory while a call is active.
 * Post-call: <5min SLA — runs FDE extraction with Claude, creates a Google Doc,
 *            inserts a meeting thread into Central feed.
 */

import { randomUUID } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import { queryClaude } from '../sources/claude'
import { queryGemini, isGeminiConnected } from '../sources/gemini'
import { isClaudeConnected } from '../sources/claude'
import { createGoogleDoc, isGdocsConnected } from '../sources/gdocs'
import { upsertItem } from '../db'
import type { StreamItem } from '../../shared/types'
import {
  extractEmailFromText,
  parseFollowUpMeeting,
  transcriptMentionsScheduling,
  type FollowUpMeetingIntent
} from '../../shared/meeting-extraction'
import { proposeMeetingActions } from './meetingActions'
import {
  ingestMeetingChunk,
  ingestMeetingPrediction,
  ingestMeetingSignal,
  ingestMeetingStar,
  ingestStreamItem
} from '../kb/pipeline'
import { emitServerEvent } from '../telemetry/service'

export type MeetingChunk = { text: string; ts: number }
export type MeetingSignal = { type: string; text: string; ts: number; chunkIndex: number }
export type MeetingStarred = { ts: number; text: string; predictionId?: string }
export type MeetingPrediction = {
  id: string
  signalText: string
  sayThis: string
  followUp: string
  flag?: string
  ts: number
}

export type MeetingSession = {
  id: string
  startedAt: number
  endedAt?: number
  title?: string
  dealHint?: string
  chunks: MeetingChunk[]
  signals: MeetingSignal[]
  starred: MeetingStarred[]
  predictions: MeetingPrediction[]
  /** newest cached prediction, served to mobile cluster on ⌘⇧M */
  latestPredictionId?: string
}

export type MeetingExtraction = {
  summary: string
  buildPrompt: string
  nextSteps: string[]
  flags: string[]
  decisions: string[]
  questions: string[]
  scopeDecision: 'quick_win' | 'big_bet' | 'unknown'
  followUpMeeting?: FollowUpMeetingIntent
}

export type MeetingResult = {
  sessionId: string
  durationMs: number
  transcript: string
  extraction: MeetingExtraction
  googleDocUrl?: string
  googleDocError?: string
  feedItemId: string
}

/* ----------------------------- session state ----------------------------- */

let active: MeetingSession | null = null
const archive = new Map<string, MeetingSession>()
const extractionArchive = new Map<string, MeetingExtraction>()

export function startMeetingSession(input: { title?: string; dealHint?: string } = {}): MeetingSession {
  if (active) endMeetingSession({ persist: false })
  active = {
    id: `meet-${randomUUID()}`,
    startedAt: Date.now(),
    title: input.title,
    dealHint: input.dealHint,
    chunks: [],
    signals: [],
    starred: [],
    predictions: []
  }
  emitServerEvent(
    'meeting_start',
    {
      sessionId: active.id,
      title: input.title,
      dealHint: input.dealHint
    },
    {
      subjectType: 'meeting',
      subjectId: active.id,
      surface: 'workspace'
    }
  )
  return active
}

export function getActiveMeeting(): MeetingSession | null {
  return active
}

export function getMeeting(id: string): MeetingSession | null {
  return active?.id === id ? active : archive.get(id) ?? null
}

function sanitizeTranscript(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\].*?\x07/g, '')
    .replace(/\r/g, '')
    .replace(/\[2K/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function graphMeetingChunk(session: MeetingSession, idx: number): void {
  const c = session.chunks[idx]
  if (!c?.text.trim()) return
  ingestMeetingChunk({
    sessionId: session.id,
    chunkIndex: idx,
    text: c.text,
    ts: c.ts,
    title: session.title,
    dealHint: session.dealHint
  })
}

export function ingestChunk(chunk: { text: string; ts?: number }): MeetingSession | null {
  if (!active) return null
  const text = sanitizeTranscript(chunk.text)
  if (!text) return active

  const last = active.chunks.at(-1)
  if (last) {
    if (last.text === text) return active
    if (text.startsWith(last.text)) {
      last.text = text
      last.ts = chunk.ts ?? Date.now()
      detectSignalsForChunk(active, active.chunks.length - 1)
      try {
        graphMeetingChunk(active, active.chunks.length - 1)
      } catch (e) {
        console.warn('[meeting] kb chunk ingest failed:', (e as Error).message)
      }
      return active
    }
    if (last.text.startsWith(text)) return active
  }

  active.chunks.push({ text, ts: chunk.ts ?? Date.now() })
  const idx = active.chunks.length - 1
  detectSignalsForChunk(active, idx)
  try {
    graphMeetingChunk(active, idx)
  } catch (e) {
    console.warn('[meeting] kb chunk ingest failed:', (e as Error).message)
  }
  return active
}

export function starMoment(text?: string): MeetingStarred | null {
  if (!active) return null
  const ts = Date.now()
  const moment: MeetingStarred = {
    ts,
    text: text?.trim() || lastFewChunks(active, 6),
    predictionId: active.latestPredictionId
  }
  active.starred.push(moment)
  try {
    ingestMeetingStar({
      sessionId: active.id,
      text: moment.text,
      ts: moment.ts,
      title: active.title,
      dealHint: active.dealHint
    })
  } catch (e) {
    console.warn('[meeting] kb star ingest failed:', (e as Error).message)
  }
  return moment
}

function lastFewChunks(session: MeetingSession, n: number): string {
  return session.chunks.slice(-n).map((c) => c.text).join(' ')
}

/* ----------------------------- signal rules ------------------------------ */

const SIGNAL_PATTERNS: { type: string; re: RegExp }[] = [
  { type: 'compliance', re: /\b(gdpr|hipaa|soc ?2|ccpa|iso ?27001|scc|residency|frankfurt)\b/i },
  { type: 'tool', re: /\b(shopify|hubspot|salesforce|netsuite|quickbooks|stripe|linear|notion|airtable|monday|asana|jira|zendesk|zapier|retool|claude|cursor|gemini)\b/i },
  { type: 'tech_q', re: /\b(api|webhook|integration|rate limit|sso|saml|oauth|mfa)\b/i },
  { type: 'timeline', re: /\b(q[1-4]|deadline|launch|go.?live|by (next|end of)|\d+ (days|weeks|months))\b/i },
  { type: 'budget', re: /\b(\$[\d,]+|\d+k|budget|cost|investment|spend)\b/i },
  { type: 'blocker', re: /\b(blocked|blocker|stuck|legal|procurement|approval|sign.?off|concern)\b/i },
  { type: 'scope', re: /\b(custom|bespoke|build|integrate|pilot|poc|trial)\b/i }
]

function detectSignalsForChunk(session: MeetingSession, idx: number): void {
  const chunk = session.chunks[idx]
  const text = chunk.text
  for (const { type, re } of SIGNAL_PATTERNS) {
    if (!re.test(text)) continue
    const exists = session.signals.some(
      (s) => s.type === type && s.text === text && s.chunkIndex === idx
    )
    if (!exists) {
      const signal = { type, text, ts: chunk.ts, chunkIndex: idx }
      session.signals.push(signal)
      try {
        ingestMeetingSignal({
          sessionId: session.id,
          type: signal.type,
          text: signal.text,
          ts: signal.ts,
          chunkIndex: signal.chunkIndex,
          title: session.title,
          dealHint: session.dealHint
        })
      } catch (e) {
        console.warn('[meeting] kb signal ingest failed:', (e as Error).message)
      }
    }
  }
}

/* --------------------------- speculative answer -------------------------- */

const SPEC_SYSTEM = `You are a Field Deployment Engineer (FDE) listening to a live sales call for an AI agency.
The user is the AE/founder. When you see a chunk, predict what the AE is about to ask and answer it.

Return JSON only:
{"sayThis":"2-4 confident sentences the AE can say out loud","followUp":"one follow-up question","flag":"one-line risk or null"}`

function parseJsonFromModel(raw: string): { sayThis: string; followUp: string; flag?: string } | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? raw).trim()
  try {
    const parsed = JSON.parse(body) as { sayThis?: string; followUp?: string; flag?: string | null }
    if (!parsed.sayThis) return null
    return {
      sayThis: parsed.sayThis.trim(),
      followUp: parsed.followUp?.trim() ?? '',
      flag: parsed.flag?.trim() || undefined
    }
  } catch {
    return null
  }
}

export async function speculate(
  signalText: string,
  context?: { dealHint?: string; recentChunks?: string[] }
): Promise<MeetingPrediction | null> {
  if (!active) return null

  const recent = context?.recentChunks ?? active.chunks.slice(-6).map((c) => c.text)
  const user = `Deal hint: ${context?.dealHint ?? active.dealHint ?? 'unknown'}
Recent transcript (last few chunks):
${recent.join('\n')}

Latest signal chunk:
"${signalText}"

What is the AE about to need?`

  let raw: string | null = null

  if (isClaudeConnected()) {
    try {
      const item = await queryClaude(user, SPEC_SYSTEM)
      raw = item.bodyFull ?? item.body
    } catch (e) {
      console.warn('[meeting] claude speculate failed', (e as Error).message)
    }
  }
  if (!raw && isGeminiConnected()) {
    try {
      const item = await queryGemini(user, SPEC_SYSTEM)
      raw = item.bodyFull ?? item.body
    } catch (e) {
      console.warn('[meeting] gemini speculate failed', (e as Error).message)
    }
  }
  if (!raw) return null

  const parsed = parseJsonFromModel(raw)
  if (!parsed) return null

  const prediction: MeetingPrediction = {
    id: `pred-${randomUUID()}`,
    signalText,
    sayThis: parsed.sayThis,
    followUp: parsed.followUp,
    flag: parsed.flag,
    ts: Date.now()
  }

  active.predictions.push(prediction)
  active.latestPredictionId = prediction.id
  try {
    ingestMeetingPrediction({
      sessionId: active.id,
      predictionId: prediction.id,
      signalText: prediction.signalText,
      sayThis: prediction.sayThis,
      followUp: prediction.followUp,
      flag: prediction.flag,
      ts: prediction.ts,
      title: active.title,
      dealHint: active.dealHint
    })
  } catch (e) {
    console.warn('[meeting] kb prediction ingest failed:', (e as Error).message)
  }
  return prediction
}

export function getLatestPrediction(): MeetingPrediction | null {
  if (!active?.latestPredictionId) return null
  return active.predictions.find((p) => p.id === active!.latestPredictionId) ?? null
}

/* ------------------------------ post-call -------------------------------- */

const FDE_SYSTEM = `You are an FDE writing a structured post-call brief.

Input: a transcript from a sales/discovery call run by an AI agency founder.
Output: JSON only, no prose around it.

{
  "summary": "3-5 sentence executive summary",
  "buildPrompt": "structured agent brief — business goal, constraints, scope decision, agent instructions, dependencies",
  "nextSteps": ["action 1", "action 2"],
  "flags": ["risk 1", "risk 2"],
  "decisions": ["decision 1"],
  "questions": ["open question 1"],
  "scopeDecision": "quick_win | big_bet | unknown",
  "followUpMeeting": {
    "requested": true,
    "title": "short meeting title for calendar",
    "attendeeName": "name if mentioned",
    "attendeeEmail": "email if mentioned else null",
    "suggestedStart": "ISO-8601 UTC start if a specific time was agreed, else null",
    "eventTypeSlug": "cal.com event slug if mentioned else null",
    "notes": "1 line context for the booking"
  }
}

Set followUpMeeting.requested to true only when the call explicitly discussed scheduling a follow-up call/meeting. Extract attendee email/name from the transcript when possible.

scopeDecision criteria:
- quick_win: <45 days, no custom build, clear use case
- big_bet: custom build required, security review, >90 days
- unknown: insufficient info

Be specific. No generic sales language.`

async function extractWithLLM(transcript: string): Promise<MeetingExtraction> {
  const user = `Meeting transcript:\n\n${transcript}\n\nReturn the JSON brief.`
  let raw: string | null = null

  if (isClaudeConnected()) {
    try {
      const item = await queryClaude(user, FDE_SYSTEM)
      raw = item.bodyFull ?? item.body
    } catch (e) {
      console.warn('[meeting] claude FDE failed', (e as Error).message)
    }
  }
  if (!raw && isGeminiConnected()) {
    try {
      const item = await queryGemini(user, FDE_SYSTEM)
      raw = item.bodyFull ?? item.body
    } catch (e) {
      console.warn('[meeting] gemini FDE failed', (e as Error).message)
    }
  }

  if (!raw) {
    return fallbackExtraction(transcript)
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced?.[1] ?? raw).trim()
  try {
    const parsed = JSON.parse(body) as Partial<MeetingExtraction>
    return enrichExtraction(
      {
        summary: parsed.summary?.trim() ?? '(no summary)',
        buildPrompt: parsed.buildPrompt?.trim() ?? '(no build prompt)',
        nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        scopeDecision:
          parsed.scopeDecision === 'quick_win' || parsed.scopeDecision === 'big_bet'
            ? parsed.scopeDecision
            : 'unknown',
        followUpMeeting: parseFollowUpMeeting(parsed.followUpMeeting) ?? undefined
      },
      transcript
    )
  } catch {
    return fallbackExtraction(transcript)
  }
}

function enrichExtraction(extraction: MeetingExtraction, transcript: string): MeetingExtraction {
  const blob = [transcript, extraction.summary, ...extraction.nextSteps].join('\n')
  const mentionsScheduling =
    extraction.followUpMeeting?.requested || transcriptMentionsScheduling(blob)

  if (!mentionsScheduling) return extraction

  const email =
    extraction.followUpMeeting?.attendeeEmail ?? extractEmailFromText(blob)
  const followUp: FollowUpMeetingIntent = {
    requested: true,
    title:
      extraction.followUpMeeting?.title ??
      (extraction.nextSteps.find((s) => transcriptMentionsScheduling(s))?.slice(0, 80) ||
        'Follow-up call'),
    attendeeName: extraction.followUpMeeting?.attendeeName,
    attendeeEmail: email,
    suggestedStart: extraction.followUpMeeting?.suggestedStart,
    eventTypeSlug: extraction.followUpMeeting?.eventTypeSlug,
    notes:
      extraction.followUpMeeting?.notes ??
      extraction.nextSteps.find((s) => transcriptMentionsScheduling(s))
  }

  return { ...extraction, followUpMeeting: followUp }
}

function fallbackExtraction(transcript: string): MeetingExtraction {
  return enrichExtraction(
    {
      summary: transcript.slice(0, 400) + (transcript.length > 400 ? '…' : ''),
      buildPrompt: 'Connect Claude or Gemini to enable post-call FDE extraction.',
      nextSteps: [],
      flags: ['No LLM connected — extraction skipped.'],
      decisions: [],
      questions: [],
      scopeDecision: 'unknown'
    },
    transcript
  )
}

function formatDocBody(session: MeetingSession, extraction: MeetingExtraction, transcript: string): string {
  const lines: string[] = []
  const date = new Date(session.startedAt)
  const durationMin = Math.max(1, Math.round(((session.endedAt ?? Date.now()) - session.startedAt) / 60000))

  lines.push(`Meeting — ${date.toLocaleString()}`)
  lines.push(`Duration: ${durationMin} min`)
  if (session.title) lines.push(`Title: ${session.title}`)
  if (session.dealHint) lines.push(`Deal: ${session.dealHint}`)
  lines.push('')
  lines.push('━━━ SUMMARY ━━━')
  lines.push(extraction.summary)
  lines.push('')
  lines.push('━━━ BUILD PROMPT ━━━')
  lines.push(extraction.buildPrompt)
  lines.push(`Scope: ${extraction.scopeDecision}`)
  lines.push('')
  if (extraction.nextSteps.length > 0) {
    lines.push('━━━ NEXT STEPS ━━━')
    for (const s of extraction.nextSteps) lines.push(`• ${s}`)
    lines.push('')
  }
  if (extraction.flags.length > 0) {
    lines.push('━━━ FLAGS ━━━')
    for (const f of extraction.flags) lines.push(`⚠ ${f}`)
    lines.push('')
  }
  if (extraction.decisions.length > 0) {
    lines.push('━━━ DECISIONS ━━━')
    for (const d of extraction.decisions) lines.push(`✓ ${d}`)
    lines.push('')
  }
  if (extraction.questions.length > 0) {
    lines.push('━━━ OPEN QUESTIONS ━━━')
    for (const q of extraction.questions) lines.push(`? ${q}`)
    lines.push('')
  }
  if (session.starred.length > 0) {
    lines.push('━━━ STARRED MOMENTS ━━━')
    for (const m of session.starred) {
      lines.push(`★ ${new Date(m.ts).toLocaleTimeString()} — ${m.text}`)
      const pred = m.predictionId
        ? session.predictions.find((p) => p.id === m.predictionId)
        : null
      if (pred) {
        lines.push(`   ↳ Said: ${pred.sayThis}`)
        if (pred.followUp) lines.push(`   ↳ Follow up: ${pred.followUp}`)
        if (pred.flag) lines.push(`   ↳ Flag: ${pred.flag}`)
      }
    }
    lines.push('')
  }
  if (session.signals.length > 0) {
    lines.push('━━━ DETECTED SIGNALS ━━━')
    const grouped = new Map<string, string[]>()
    for (const s of session.signals) {
      const arr = grouped.get(s.type) ?? []
      arr.push(s.text)
      grouped.set(s.type, arr)
    }
    for (const [type, items] of grouped) {
      lines.push(`[${type}]`)
      for (const item of items.slice(0, 8)) lines.push(`  - ${item}`)
    }
    lines.push('')
  }
  if (extraction.followUpMeeting?.requested) {
    lines.push('━━━ FOLLOW-UP MEETING ━━━')
    const fm = extraction.followUpMeeting
    if (fm.title) lines.push(`Title: ${fm.title}`)
    if (fm.attendeeName) lines.push(`Guest: ${fm.attendeeName}`)
    if (fm.attendeeEmail) lines.push(`Email: ${fm.attendeeEmail}`)
    if (fm.suggestedStart) lines.push(`When: ${fm.suggestedStart}`)
    if (fm.notes) lines.push(`Notes: ${fm.notes}`)
    lines.push('')
  }
  lines.push('━━━ FULL TRANSCRIPT ━━━')
  lines.push(transcript)

  return lines.join('\n')
}

export function exportMeetingMarkdown(
  sessionId: string,
  mode: 'full' | 'summary' = 'full'
): string | null {
  const session = getMeeting(sessionId)
  if (!session) return null
  const extraction = extractionArchive.get(sessionId)
  const transcript = session.chunks.map((c) => c.text).join('\n').trim()
  if (!extraction) return transcript || null
  if (mode === 'summary') {
    const lines = [
      extraction.summary,
      '',
      `Scope: ${extraction.scopeDecision}`,
      ...(extraction.nextSteps.length ? ['', 'Next steps:', ...extraction.nextSteps.map((s) => `• ${s}`)] : [])
    ]
    return lines.join('\n').trim()
  }
  return formatDocBody(session, extraction, transcript)
}

function buildFeedItem(
  session: MeetingSession,
  extraction: MeetingExtraction,
  docUrl?: string,
  docError?: string
): StreamItem {
  const dateStr = new Date(session.startedAt).toLocaleString()
  const title = session.title
    ? `Meeting · ${session.title}`
    : `Meeting · ${dateStr}`
  const bodyLines = [
    extraction.summary,
    '',
    `Scope: ${extraction.scopeDecision}`,
    extraction.nextSteps.length > 0
      ? `Next: ${extraction.nextSteps.slice(0, 3).join(' · ')}`
      : ''
  ].filter(Boolean)

  return {
    id: `meet-${session.id}`,
    source: 'meeting',
    sender: { name: 'Meeting Capture', handle: 'meeting' },
    timestamp: new Date(session.endedAt ?? Date.now()),
    title,
    body: bodyLines.join('\n'),
    bodyFull: `${bodyLines.join('\n')}\n\nBuild prompt:\n${extraction.buildPrompt}`,
    isUnread: true,
    isStarred: false,
    metadata: {
      sessionId: session.id,
      durationMs: (session.endedAt ?? Date.now()) - session.startedAt,
      googleDocUrl: docUrl,
      googleDocError: docError,
      scopeDecision: extraction.scopeDecision,
      flags: extraction.flags,
      nextSteps: extraction.nextSteps,
      decisions: extraction.decisions,
      questions: extraction.questions,
      starredCount: session.starred.length,
      chunkCount: session.chunks.length,
      signalCount: session.signals.length,
      buildPrompt: extraction.buildPrompt,
      followUpMeeting: extraction.followUpMeeting,
      proposedActions: proposeMeetingActions(session, extraction)
    }
  }
}

export async function endMeetingSession(
  input: { persist?: boolean; io?: SocketServer } = {}
): Promise<MeetingResult | null> {
  if (!active) return null
  active.endedAt = Date.now()
  const session = active
  active = null

  const durationMs = (session.endedAt ?? Date.now()) - session.startedAt
  emitServerEvent(
    'meeting_end',
    {
      sessionId: session.id,
      durationMs,
      chunkCount: session.chunks.length,
      title: session.title,
      dealHint: session.dealHint
    },
    {
      subjectType: 'meeting',
      subjectId: session.id,
      surface: 'workspace'
    }
  )

  if (input.persist === false) {
    archive.set(session.id, session)
    return null
  }

  const transcript = session.chunks.map((c) => c.text).join('\n').trim()

  const extraction = transcript
    ? await extractWithLLM(transcript)
    : {
        summary:
          'No transcript captured — whisper.cpp may not be running. Use tray → Setup meeting transcription, then verify audio status.',
        buildPrompt: '(no transcript to extract from)',
        nextSteps: [],
        flags: ['No transcript captured during the call.'],
        decisions: [],
        questions: [],
        scopeDecision: 'unknown' as const
      }

  let docUrl: string | undefined
  let docError: string | undefined

  // Skip Google Doc entirely when there's nothing meaningful to write
  if (!transcript) {
    docError = 'Skipped — no transcript captured.'
  } else if (await isGdocsConnected()) {
    try {
      const dateStr = new Date(session.startedAt).toLocaleString()
      const docTitle = session.title
        ? `Meeting — ${session.title} — ${dateStr}`
        : `Meeting — ${dateStr}`
      const docBody = formatDocBody(session, extraction, transcript)
      const doc = await createGoogleDoc({ title: docTitle, body: docBody })
      docUrl = doc.url
    } catch (e) {
      const msg = (e as Error).message
      docError = /not enabled|accessNotConfigured|403/i.test(msg)
        ? `${msg} — enable Google Drive API + Google Docs API in GCP, then Integrations → Google Docs → Reconnect Gmail.`
        : msg
      console.warn('[meeting] google doc create failed:', docError)
    }
  } else {
    docError =
      'Google Docs not connected — open Integrations → Gmail, reconnect with Docs scope, then enable Drive + Docs APIs in your GCP project.'
  }

  const feedItem = buildFeedItem(session, extraction, docUrl, docError)
  upsertItem(feedItem)
  try {
    ingestStreamItem(feedItem)
  } catch (e) {
    console.warn('[meeting] kb ingest failed:', (e as Error).message)
  }
  try {
    const { upsertEngagementFromMeeting } = require('../fde/engagementStore') as typeof import('../fde/engagementStore')
    upsertEngagementFromMeeting({
      sessionId: session.id,
      feedItemId: feedItem.id,
      title: session.title,
      dealHint: session.dealHint,
      extraction,
      googleDocUrl: docUrl
    })
  } catch (e) {
    console.warn('[meeting] engagement upsert failed:', (e as Error).message)
  }
  input.io?.emit('stream:item', feedItem)

  archive.set(session.id, session)
  extractionArchive.set(session.id, extraction)

  return {
    sessionId: session.id,
    durationMs,
    transcript,
    extraction,
    googleDocUrl: docUrl,
    googleDocError: docError,
    feedItemId: feedItem.id
  }
}
