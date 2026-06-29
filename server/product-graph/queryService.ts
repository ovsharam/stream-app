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

/**
 * Given a deal description and customer ID, return relevant product context.
 * Used during FDE intake to scope what's buildable and flag known limitations.
 */
export async function queryProductGraph(
  customerId: string,
  dealDescription: string
): Promise<ProductGraphQueryResult> {
  const terms = await extractQueryTerms(dealDescription)
  const query = terms.join(' ')

  // FTS search across all node types — higher limit so limitations/constraints surface via relevance
  const matchedNodes = searchProductNodes(customerId, query, 60)
  const matchedIds = new Set(matchedNodes.map((n) => n.id))

  // Scope blanket limitation/constraint include to the source documents that FTS matched.
  // Without this, a multi-product customer (e.g. Lenis + Stripe) returns all limitations from
  // every product regardless of query relevance.
  const matchedSourceDocs = new Set(matchedNodes.map((n) => n.sourceDocId))

  const allLimitations = listProductNodes(customerId, 'limitation')
  const allConstraints = listProductNodes(customerId, 'constraint')

  const scopedLimitations = matchedSourceDocs.size > 0
    ? allLimitations.filter((n) => matchedSourceDocs.has(n.sourceDocId))
    : allLimitations
  const scopedConstraints = matchedSourceDocs.size > 0
    ? allConstraints.filter((n) => matchedSourceDocs.has(n.sourceDocId))
    : allConstraints

  // Merge without duplication
  const nodeMap = new Map<string, ProductNode>()
  for (const n of [...matchedNodes, ...scopedLimitations, ...scopedConstraints]) {
    nodeMap.set(n.id, n)
  }

  const allNodes = Array.from(nodeMap.values())
  const allIds = allNodes.map((n) => n.id)

  // Fetch edges between these nodes
  const relevantEdges = getProductEdges(customerId, allIds)

  const byLabel = {
    capability: [] as ProductNode[],
    limitation: [] as ProductNode[],
    integration: [] as ProductNode[],
    pattern: [] as ProductNode[],
    constraint: [] as ProductNode[],
    workaround: [] as ProductNode[]
  }

  for (const node of allNodes) {
    byLabel[node.label]?.push(node)
  }

  // Sort: matched nodes first (they're most relevant), then by confidence
  const sortNodes = (nodes: ProductNode[]) =>
    nodes.sort((a, b) => {
      const aMatched = matchedIds.has(a.id) ? 1 : 0
      const bMatched = matchedIds.has(b.id) ? 1 : 0
      return bMatched - aMatched || b.confidence - a.confidence
    })

  return {
    capabilities: sortNodes(byLabel.capability),
    limitations: sortNodes(byLabel.limitation),
    integrations: sortNodes(byLabel.integration),
    patterns: sortNodes(byLabel.pattern),
    constraints: sortNodes(byLabel.constraint),
    workarounds: sortNodes(byLabel.workaround),
    relevantEdges
  }
}

/** Format a query result as a markdown context block for use in FDE prompts */
export function formatProductContextForPrompt(result: ProductGraphQueryResult, customerId: string): string {
  const sections: string[] = [`## Product Context (${customerId})\n`]

  if (result.capabilities.length > 0) {
    sections.push('### Capabilities')
    for (const n of result.capabilities.slice(0, 10)) {
      sections.push(`- **${n.name}**: ${n.description}`)
    }
  }

  if (result.limitations.length > 0) {
    sections.push('\n### Known Limitations')
    for (const n of result.limitations) {
      sections.push(`- **${n.name}**: ${n.description}`)
    }
  }

  if (result.constraints.length > 0) {
    sections.push('\n### Constraints')
    for (const n of result.constraints) {
      sections.push(`- **${n.name}**: ${n.description}`)
    }
  }

  if (result.integrations.length > 0) {
    sections.push('\n### Integrations')
    for (const n of result.integrations.slice(0, 8)) {
      sections.push(`- **${n.name}**: ${n.description}`)
    }
  }

  if (result.workarounds.length > 0) {
    sections.push('\n### Workarounds')
    for (const n of result.workarounds) {
      sections.push(`- **${n.name}**: ${n.description}`)
    }
  }

  return sections.join('\n')
}
