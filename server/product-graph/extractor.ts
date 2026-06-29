import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { DocChunk } from './chunker'
import type { ReviewQueueItem } from '../../shared/product-graph'

const MODEL = 'claude-haiku-4-5-20251001'  // fast + cheap for extraction

const ExtractedNodeSchema = z.object({
  nodes: z.array(
    z.object({
      label: z.enum(['capability', 'limitation', 'integration', 'pattern', 'constraint', 'workaround']),
      name: z.string().describe('Concise identifier, 3–8 words'),
      description: z.string().describe('Clear factual description, 1–3 sentences'),
      confidence: z.number().min(0).max(1).describe('How clearly stated in source: 1.0 = explicit, 0.5 = implied')
    })
  ).max(12)
})

const SYSTEM_PROMPT = `You extract structured knowledge from product documentation to build a product context graph.

Node types:
- capability: something the product CAN do (features, supported workflows, APIs exposed)
- limitation: something the product CANNOT do, hard constraints, known gaps
- integration: external system, API, or platform the product connects with
- pattern: a common usage pattern, recommended workflow, or implementation approach
- constraint: business rule, compliance requirement, pricing tier boundary, SLA limit, quota
- workaround: an explicit or implied way to work around a limitation

Rules:
- Extract only what is clearly stated or strongly implied in the text
- Prefer specific, concrete nodes over vague ones
- Skip marketing fluff — only extract factual, technically useful information
- confidence=1.0: explicitly stated; 0.7: clearly implied; 0.5: inferred
- name should be noun phrase (e.g., "Bulk export via API", "No SSO on Starter plan")
- Deduplicate: if the same fact appears twice in the chunk, extract it once`

export async function extractChunk(
  chunk: DocChunk,
  jobId: string,
  customerId: string
): Promise<Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[]> {
  if (chunk.text.trim().length < 50) return []

  const contextHint = chunk.heading ? `Section: ${chunk.heading}\n\n` : ''
  const prompt = `${contextHint}${chunk.text}`

  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: ExtractedNodeSchema,
      system: SYSTEM_PROMPT,
      prompt
    })

    return object.nodes.map((n) => ({
      customerId,
      jobId,
      label: n.label,
      name: n.name,
      description: n.description,
      confidence: n.confidence,
      sourceDocId: jobId  // jobId doubles as source doc reference
    }))
  } catch (err) {
    console.error(`[product-graph] extract error chunk ${chunk.index}:`, (err as Error).message)
    return []
  }
}

export async function extractDocument(
  chunks: DocChunk[],
  jobId: string,
  customerId: string,
  onProgress?: (done: number, total: number) => void
): Promise<Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[]> {
  const results: Omit<ReviewQueueItem, 'id' | 'status' | 'createdAt'>[] = []
  const seenNames = new Set<string>()

  for (let i = 0; i < chunks.length; i++) {
    const extracted = await extractChunk(chunks[i], jobId, customerId)

    for (const item of extracted) {
      const key = `${item.label}::${item.name.toLowerCase().trim()}`
      if (!seenNames.has(key)) {
        seenNames.add(key)
        results.push(item)
      }
    }

    onProgress?.(i + 1, chunks.length)
  }

  return results
}
