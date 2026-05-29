import type { ActionRunResult } from '../integrations/registry'
import type { ActionRunContext } from '../integrations/executors'
import { ingestConsciousness } from './pipeline'

function ok(message: string): ActionRunResult {
  return { ok: true, provider: 'mind', message, executed: [message] }
}

function fail(message: string): ActionRunResult {
  return { ok: false, provider: 'mind', message, executed: [] }
}

export async function runMind(ctx: ActionRunContext): Promise<ActionRunResult> {
  const text = ctx.parsed.body.trim()
  if (!text) return fail('Write something after @mind — e.g. @mind learning about GraphRAG velocity')

  const dp = ingestConsciousness(text)
  const preview = dp.body.slice(0, 100)
  return ok(
    `Saved to knowledge graph (${dp.intention.dominant}) — ${preview}${dp.body.length > 100 ? '…' : ''}`
  )
}
