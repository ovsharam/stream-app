/**
 * Phase 1 of the Notch-as-Piper pivot: feed live meeting transcripts back into
 * the PRODUCT graph — not the deal/engagement graph.
 *
 * The differentiated insight: during FDE calls, people surface *product deltas* —
 * "we worked around X by...", "feature Y shipped last week", "that's not supported
 * on the Starter plan", "the API can't do Z yet". Those are exactly the
 * capability / limitation / workaround / constraint nodes the product graph needs,
 * and they never make it into docs. This module extracts them with a delta-focused
 * lens and routes them through the same human review queue as connector ingestion,
 * so nothing hits the graph unreviewed.
 */

import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { chunkDocument } from './chunker'
import { createIngestJob, updateJobStatus, insertReviewItems } from './ingestStore'
import type { ReviewQueueItem } from '../../shared/product-graph'

const MODEL = 'claude-haiku-4-5-20251001'
const MIN_TRANSCRIPT_CHARS = 200

/** Local-dev fallback matches the 'org' customerId used across the local stack.
 *  Production sets PLUMB_CUSTOMER_ID (or we resolve org from the session later). */
export function resolveMeetingCustomerId(): string {
  return process.env.PLUMB_CUSTOMER_ID?.trim() || 'org'
}

const MeetingDeltaSchema = z.object({
  nodes: z
    .array(
      z.object({
        label: z.enum([
          'capability',
          'limitation',
          'integration',
          'pattern',
          'constraint',
          'workaround'
        ]),
        name: z.string().describe('Concise identifier, 3–8 words'),
        description: z
          .string()
          .describe('What was learned, stated factually, 1–3 sentences'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('1.0 = explicitly stated on the call, 0.5 = implied')
      })
    )
    .max(8)
})

const SYSTEM_PROMPT = `You extract PRODUCT knowledge deltas from a sales/FDE call transcript to keep a product context graph up to date.

You are NOT summarizing the meeting. You are mining the transcript for durable, reusable facts about what the PRODUCT can and cannot do — the kind of knowledge an engineer would want the next time a similar deal comes up.

Extract a node ONLY when the transcript reveals one of:
- capability: a product feature/workflow/API confirmed to work ("yes, we can do bulk export via the API")
- limitation: something the product cannot do / a hard gap hit on the call ("SSO isn't available on Starter")
- integration: an external system the product connects to (or was confirmed NOT to)
- pattern: a recommended implementation approach that worked ("for that we usually wire a webhook then...")
- constraint: a business rule, quota, pricing-tier boundary, SLA, or compliance limit stated
- workaround: an explicit way the team got around a limitation ("we worked around it by scripting the import")

Hard rules:
- IGNORE scheduling, pleasantries, pricing negotiation, next-step logistics, and client-specific deal details.
- Extract only PRODUCT facts that generalize beyond this one client.
- If the call surfaces nothing durable about the product, return an empty array. Empty is correct and expected.
- name = noun phrase ("No SSO on Starter plan", "Bulk export via API", "Webhook-then-poll ingestion pattern").
- confidence: 1.0 explicitly stated, 0.7 clearly implied, 0.5 inferred.`

export interface MeetingFeedResult {
  jobId: string | null
  nodesExtracted: number
  skipped?: string
}

/**
 * Fire-and-forget friendly: extract product deltas from a finished meeting
 * transcript and drop them into the review queue. Never throws — meeting end
 * must not fail because the graph feed hiccuped.
 */
export async function feedMeetingTranscriptToGraph(input: {
  transcript: string
  sessionId: string
  title?: string
  customerId?: string
}): Promise<MeetingFeedResult> {
  const transcript = input.transcript.trim()
  if (transcript.length < MIN_TRANSCRIPT_CHARS) {
    return { jobId: null, nodesExtracted: 0, skipped: 'transcript too short' }
  }

  const customerId = input.customerId ?? resolveMeetingCustomerId()
  const label = input.title ? `[meeting] ${input.title}` : `[meeting] ${input.sessionId}`

  const job = createIngestJob({ customerId, fileName: label, mimeType: 'text/plain' })
  updateJobStatus(job.id, 'extracting')

  const chunks = chunkDocument(transcript)
  const batch: Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[] = []
  const seen = new Set<string>()

  try {
    for (const chunk of chunks) {
      if (chunk.text.trim().length < 50) continue
      const nodes = await extractMeetingDeltas(chunk.text, job.id, customerId)
      for (const n of nodes) {
        const key = `${n.label}::${n.name.toLowerCase().trim()}`
        if (seen.has(key)) continue
        seen.add(key)
        batch.push(n)
      }
    }

    if (batch.length > 0) insertReviewItems(batch)
    updateJobStatus(job.id, 'review', {
      chunkCount: chunks.length,
      nodeCount: batch.length
    })
    return { jobId: job.id, nodesExtracted: batch.length }
  } catch (err) {
    updateJobStatus(job.id, 'error', { errorMsg: (err as Error).message })
    return { jobId: job.id, nodesExtracted: 0, skipped: (err as Error).message }
  }
}

async function extractMeetingDeltas(
  text: string,
  jobId: string,
  customerId: string
): Promise<Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[]> {
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: MeetingDeltaSchema,
      system: SYSTEM_PROMPT,
      prompt: text
    })
    return object.nodes.map((n) => ({
      customerId,
      jobId,
      label: n.label,
      name: n.name,
      description: n.description,
      confidence: n.confidence,
      sourceDocId: jobId
    }))
  } catch (err) {
    console.error('[product-graph] meeting-delta extract error:', (err as Error).message)
    return []
  }
}
