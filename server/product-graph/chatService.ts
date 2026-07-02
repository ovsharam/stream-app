/**
 * Product chat — the graph-grounded Q&A engine behind Notch's "Product" view.
 *
 * The Piper lesson: broad capture + a NARROW use case = no room to hallucinate.
 * This chat answers product questions ONLY from the product graph. It cites the
 * nodes it used, carries their roadmap position (ga/beta/upcoming/requested/...),
 * and when the graph has no coverage it says so explicitly instead of guessing —
 * an FDE must never relay an invented capability to a client.
 */

import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { queryProductGraph } from './queryService'
import type { ProductNode } from '../../shared/product-graph'

const MODEL = 'claude-sonnet-4-6'
const MAX_HISTORY = 8

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string }

export type MatchedNodeSummary = {
  id: string
  label: string
  name: string
  description: string
  availability: string
  mentionCount: number
  lastConfirmedAt?: number
}

const SYSTEM_PROMPT = `You are the product-knowledge engine inside Plumb, used by Forward-Deployed Engineers (FDEs).

You answer questions about what THE PRODUCT can and cannot do, using ONLY the product graph nodes provided below. FDEs relay your answers to clients on live deals — a wrong "yes" costs a deal, an invented capability costs trust.

Availability tags on nodes (the roadmap position — respect it exactly):
- [GA] or untagged: shipped, available right now
- [BETA]: exists but gated — say so ("in beta, needs access")
- [UPCOMING]: on the roadmap, NOT usable today — never present it as available now
- [REQUESTED]: does NOT exist — it is aggregated demand. "(requested N×)" = N independent sources asked for it
- [NOT_PLANNED]: explicitly ruled out
- [DEPRECATED]: going away — warn against building on it

Hard rules:
- Answer ONLY from the nodes provided. If the nodes don't cover the question, say exactly what is missing — do NOT fill gaps from general knowledge, even when you know the answer from training data.
- Cite nodes inline by name in [brackets] when you use them, e.g. "Bulk export is supported [Bulk export via API]."
- Always state the roadmap position when it isn't GA.
- If parts of the question are covered and parts aren't, answer the covered parts and name the uncovered ones.
- Be direct and concise — FDEs read this mid-call. Lead with the answer, not preamble.
- Never speculate about pricing, timelines, or client-specific matters not in the nodes.`

function flattenNodes(result: Awaited<ReturnType<typeof queryProductGraph>>): ProductNode[] {
  return [
    ...result.capabilities,
    ...result.limitations,
    ...result.constraints,
    ...result.integrations,
    ...result.patterns,
    ...result.workarounds
  ]
}

function nodeLine(n: ProductNode): string {
  const avail = n.availability && n.availability !== 'ga' ? ` [${n.availability.toUpperCase()}]` : ' [GA]'
  const demand = n.availability === 'requested' && (n.mentionCount ?? 1) > 1 ? ` (requested ${n.mentionCount}×)` : ''
  return `- (${n.label}) ${n.name}${avail}${demand}: ${n.description}`
}

export function summarizeNode(n: ProductNode): MatchedNodeSummary {
  return {
    id: n.id,
    label: n.label,
    name: n.name,
    description: n.description,
    availability: n.availability ?? 'ga',
    mentionCount: n.mentionCount ?? 1,
    lastConfirmedAt: n.lastConfirmedAt
  }
}

export async function matchNodesForQuestion(
  customerId: string,
  question: string
): Promise<ProductNode[]> {
  const result = await queryProductGraph(customerId, question, 1)
  return flattenNodes(result)
}

/** Stream a grounded answer. Caller handles SSE framing via onDelta. */
export async function streamProductChatAnswer(input: {
  question: string
  nodes: ProductNode[]
  history?: ChatHistoryMessage[]
  onDelta: (text: string) => void
}): Promise<string> {
  const context = input.nodes.map(nodeLine).join('\n')

  const history = (input.history ?? [])
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }))

  const { textStream } = streamText({
    model: anthropic(MODEL),
    system: `${SYSTEM_PROMPT}\n\nPRODUCT GRAPH NODES (${input.nodes.length} matched):\n${context}`,
    messages: [...history, { role: 'user' as const, content: input.question }]
  })

  let full = ''
  for await (const delta of textStream) {
    full += delta
    input.onDelta(delta)
  }
  return full
}
