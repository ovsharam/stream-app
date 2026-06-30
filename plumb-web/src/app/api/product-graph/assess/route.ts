import { NextResponse } from 'next/server'
import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'

const RAILWAY_URL = process.env.STREAM_API_URL ?? 'https://api.useplumb.ai'

const AssessmentSchema = z.object({
  contextScore: z.number().min(0).max(100).describe(
    'How well-defined and buildable this deal is: 90-100=confirmed, 70-89=minor gaps, 40-69=scope decisions needed, 0-39=major blockers'
  ),
  headline: z.string().describe('One sentence verdict on this deal for an FDE scanning in 5 seconds'),
  buildable: z.array(z.string()).describe(
    'Specific things confirmed possible — reference graph node names. Max 6 items.'
  ),
  blockers: z.array(z.object({
    issue: z.string().describe('The specific constraint or gap that blocks the build'),
    action: z.string().describe('Exactly what the FDE must do to unblock this'),
  })).describe('Hard stops that must be resolved before a build can start'),
  scopeForks: z.array(z.object({
    decision: z.string().describe('The architectural or product decision that must be made'),
    options: z.array(z.string()).min(2).max(3).describe('The concrete options the graph reveals'),
  })).describe('Places where the graph reveals two valid paths — FDE must pick one before building'),
  gaps: z.array(z.string()).describe(
    'Things the deal description mentions that have NO coverage in the graph nodes. Empty array = full coverage.'
  ),
  buildSpec: z.object({
    approach: z.string().describe('The specific technical approach based on graph patterns'),
    keyConstraints: z.array(z.string()).describe('Constraints the build must respect, from graph nodes'),
    openQuestions: z.array(z.string()).describe('Remaining questions that must be answered before build starts'),
  }).nullable().describe('Populated only when contextScore >= 70, otherwise null'),
})

export type ScopeAssessment = z.infer<typeof AssessmentSchema>

export async function POST(req: Request) {
  try {
    const { customerId, dealDescription, minScore } = await req.json() as {
      customerId: string
      dealDescription: string
      minScore?: number
    }

    if (!customerId || !dealDescription?.trim()) {
      return NextResponse.json({ error: 'customerId and dealDescription required' }, { status: 400 })
    }

    // Pull matched nodes from Railway graph
    const graphRes = await fetch(`${RAILWAY_URL}/product-graph/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, dealDescription, format: 'json', minScore: minScore ?? 1 }),
    })

    if (!graphRes.ok) {
      return NextResponse.json({ error: `Graph query failed: ${graphRes.status}` }, { status: 502 })
    }

    const graphResult = await graphRes.json() as Record<string, Array<{ name: string; description: string }>>

    const totalNodes = Object.values(graphResult)
      .filter(Array.isArray)
      .reduce((sum, arr) => sum + arr.length, 0)

    if (totalNodes === 0) {
      return NextResponse.json({
        assessment: {
          contextScore: 5,
          headline: 'No matching product knowledge found — ingest product docs first.',
          buildable: [],
          blockers: [{ issue: 'Graph has no coverage for this deal', action: 'Ingest relevant product documentation in the Ingest tab' }],
          scopeForks: [],
          gaps: ['Full deal description has no graph coverage'],
          buildSpec: null,
        } satisfies ScopeAssessment,
        nodeCount: 0,
      })
    }

    // Format nodes into a structured context block for Claude
    const nodeContext = Object.entries(graphResult)
      .map(([key, nodes]) => {
        if (!Array.isArray(nodes) || nodes.length === 0) return null
        return `## ${key.toUpperCase()}\n${nodes.map(n => `- ${n.name}: ${n.description}`).join('\n')}`
      })
      .filter(Boolean)
      .join('\n\n')

    const { object } = await generateObject({
      model: google('gemini-2.5-flash-preview-05-20'),
      schema: AssessmentSchema,
      system: `You are a scope assessment engine embedded in Plumb, a tool used by Forward-Deployed Engineers (FDEs) at AI companies.

An FDE is on a deal. They describe what the prospect wants to build. You have a product knowledge graph — matched nodes from the company's actual product documentation (capabilities, limitations, constraints, patterns, integrations, workarounds).

Your job: tell the FDE whether this can be built, how clearly scoped it is, and exactly what must be resolved before a build starts. They will read this in under 30 seconds.

Scoring:
- 90-100: Fully confirmed, no blockers, build spec ready
- 70-89: Mostly clear, one or two questions remain
- 40-69: Significant scope gaps or unresolved architectural decisions
- 0-39: Major blockers or the deal doesn't match what the product can do

Rules:
- Only reference what is in the graph nodes — do NOT invent capabilities
- Blockers must cite specific limitations or constraints from the graph
- Scope forks are real architectural choices revealed by the graph — not hypotheticals
- Gaps are specific things in the deal description with zero graph coverage
- buildSpec is null if contextScore < 70
- Be concrete and direct — no hedge language, no "it depends"`,
      prompt: `DEAL DESCRIPTION:\n${dealDescription}\n\nPRODUCT GRAPH (${totalNodes} matched nodes):\n${nodeContext}`,
    })

    return NextResponse.json({ assessment: object, nodeCount: totalNodes })
  } catch (err) {
    console.error('[product-graph/assess]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
