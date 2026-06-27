/**
 * LLM observability — wraps every LLM call with Braintrust tracing.
 * Gracefully no-ops if BRAINTRUST_API_KEY is not set.
 */

let logger: { traced: typeof traced } | null = null

type TraceFn = <T>(
  name: string,
  fn: (span: { log: (data: Record<string, unknown>) => void }) => Promise<T>,
  meta?: Record<string, unknown>
) => Promise<T>

async function traced<T>(
  name: string,
  fn: (span: { log: (data: Record<string, unknown>) => void }) => Promise<T>,
  _meta?: Record<string, unknown>
): Promise<T> {
  return fn({ log: () => {} })
}

function getLogger(): { traced: TraceFn } {
  if (logger) return logger
  const key = process.env.BRAINTRUST_API_KEY?.trim()
  if (!key) {
    logger = { traced }
    return logger
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bt = require('braintrust') as {
      initLogger: (opts: { projectName: string; apiKey: string }) => void
      traced: TraceFn
    }
    bt.initLogger({ projectName: 'notch-plumb', apiKey: key })
    logger = { traced: bt.traced }
    console.log('[braintrust] observability active — project: notch-plumb')
  } catch {
    logger = { traced }
  }
  return logger!
}

export type LlmCallMeta = {
  model: string
  surface: 'chat' | 'mobile' | 'pipeline' | 'agent' | 'classifier'
  query: string
  sessionId?: string
  thinking?: boolean
}

export async function traceLlmCall<T extends { thinking?: string }>(
  meta: LlmCallMeta,
  fn: () => Promise<T>
): Promise<T & { traceId?: string }> {
  const { traced: t } = getLogger()
  let traceId: string | undefined
  const result = await t(
    `${meta.surface}/${meta.model}`,
    async (span) => {
      const res = await fn()
      span.log({
        input: meta.query,
        output: (res as Record<string, unknown>).answer ?? (res as Record<string, unknown>).response ?? '',
        metadata: {
          model: meta.model,
          surface: meta.surface,
          sessionId: meta.sessionId,
          thinking: !!res.thinking,
          thinkingLength: res.thinking?.length ?? 0
        }
      })
      traceId = undefined // Braintrust doesn't expose span ID synchronously yet
      return res
    },
    { model: meta.model }
  )
  return { ...result, traceId }
}
