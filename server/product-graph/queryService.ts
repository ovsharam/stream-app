import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { searchProductNodes, listProductNodes, getProductEdges } from './ingestStore'
import type { ProductNode, ProductGraphQueryResult } from '../../shared/product-graph'

const MODEL = 'claude-haiku-4-5-20251001'

/** Extract query terms from a natural-language deal description */
async function extractQueryTerms(dealDescription: string): Promise<string[]> {
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: z.object({
        terms: z.array(z.string()).max(8).describe('Key technical terms and concepts from the deal description')
      }),
      prompt: `Extract 4–8 key technical terms and product concepts from this deal description that would help find relevant product capabilities and limitations:\n\n${dealDescription}`
    })
    return object.terms
  } catch {
    // Fallback to simple word extraction
    return dealDescription
      .split(/\W+/)
      .filter((w) => w.length > 4)
      .slice(0, 8)
  }
}

/** Score a node's relevance to the query terms. Name matches outweigh description matches. */
function scoreRelevance(node: ProductNode, terms: string[]): number {
  const name = node.name.toLowerCase()
  const desc = node.description.toLowerCase()
  let score = 0
  for (const term of terms) {
    const t = term.toLowerCase()
    if (name.includes(t)) score += 3
    else if (desc.includes(t)) score += 1
  }
  return score
}

const LABEL_CAPS: Record<string, number> = {
  capability:   8,
  limitation:   6,
  constraint:   6,
  integration:  5,
  pattern:      5,
  workaround:   4,
}

/**
 * Given a deal description and customer ID, return relevant product context.
 * Used during FDE intake to scope what's buildable and flag known limitations.
 */
export async function queryProductGraph(
  customerId: string,
  dealDescription: string,
  minScore = 1,
): Promise<ProductGraphQueryResult> {
  const terms = await extractQueryTerms(dealDescription)
  const query = terms.join(' ')

  // FTS candidates — broad sweep, we'll re-rank by term overlap below
  const ftsNodes = searchProductNodes(customerId, query, 60)

  // For limitations and constraints, FTS vocabulary often misses them (negative phrasing).
  // Fetch all, score against terms, keep only ones meeting the minScore threshold.
  const allLimitations = listProductNodes(customerId, 'limitation')
  const allConstraints = listProductNodes(customerId, 'constraint')

  const scoredLimitations = allLimitations
    .map((n) => ({ node: n, score: scoreRelevance(n, terms) }))
    .filter(({ score }) => score >= minScore)

  const scoredConstraints = allConstraints
    .map((n) => ({ node: n, score: scoreRelevance(n, terms) }))
    .filter(({ score }) => score >= minScore)

  // Merge: FTS nodes get scored too; higher score wins if a node appears in multiple sets
  const nodeScores = new Map<string, number>()
  const nodeMap = new Map<string, ProductNode>()

  for (const node of ftsNodes) {
    const score = scoreRelevance(node, terms)
    nodeMap.set(node.id, node)
    nodeScores.set(node.id, score)
  }
  for (const { node, score } of [...scoredLimitations, ...scoredConstraints]) {
    nodeMap.set(node.id, node)
    nodeScores.set(node.id, Math.max(nodeScores.get(node.id) ?? 0, score))
  }

  // Group by label
  const byLabel: Record<string, ProductNode[]> = {
    capability: [], limitation: [], integration: [],
    pattern: [], constraint: [], workaround: [],
  }
  for (const node of nodeMap.values()) {
    byLabel[node.label]?.push(node)
  }

  // Sort by relevance score then confidence, cap per label
  const rank = (nodes: ProductNode[], cap: number) =>
    nodes
      .sort((a, b) => {
        const sd = (nodeScores.get(b.id) ?? 0) - (nodeScores.get(a.id) ?? 0)
        return sd !== 0 ? sd : b.confidence - a.confidence
      })
      .slice(0, cap)

  const allIds = [...nodeMap.keys()]

  return {
    capabilities: rank(byLabel.capability,  LABEL_CAPS.capability),
    limitations:  rank(byLabel.limitation,  LABEL_CAPS.limitation),
    integrations: rank(byLabel.integration, LABEL_CAPS.integration),
    patterns:     rank(byLabel.pattern,     LABEL_CAPS.pattern),
    constraints:  rank(byLabel.constraint,  LABEL_CAPS.constraint),
    workarounds:  rank(byLabel.workaround,  LABEL_CAPS.workaround),
    relevantEdges: getProductEdges(customerId, allIds),
  }
}

/** Format a query result as a markdown context block for use in FDE prompts */
export function formatProductContextForPrompt(result: ProductGraphQueryResult, customerId: string): string {
  const sections: string[] = [`## Product Context (${customerId})\n`]

  const emit = (label: string, nodes: ProductNode[]) => {
    if (nodes.length === 0) return
    sections.push(`\n### ${label}`)
    for (const n of nodes) {
      const avail = n.availability && n.availability !== 'ga' ? ` [${n.availability.toUpperCase()}]` : ''
      const demand = n.availability === 'requested' && (n.mentionCount ?? 1) > 1 ? ` (requested ${n.mentionCount}×)` : ''
      sections.push(`- **${n.name}**${avail}${demand}: ${n.description}`)
    }
  }

  emit('Capabilities',      result.capabilities)
  emit('Known Limitations', result.limitations)
  emit('Constraints',       result.constraints)
  emit('Integrations',      result.integrations)
  emit('Patterns',          result.patterns)
  emit('Workarounds',       result.workarounds)

  return sections.join('\n')
}
