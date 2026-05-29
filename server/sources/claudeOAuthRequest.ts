import { createHash } from 'crypto'

export const CLAUDE_CODE_IDENTITY =
  "You are a Claude agent, built on Anthropic's Claude Agent SDK."

const CCH_SALT = '59cf53e54c78'
const CCH_POSITIONS = [4, 7, 20]
const CLAUDE_CODE_VERSION = '2.1.87'
const CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'

function computeCch(messageText: string): string {
  return createHash('sha256').update(messageText).digest('hex').slice(0, 5)
}

function computeVersionSuffix(messageText: string): string {
  const chars = CCH_POSITIONS.map((i) => messageText[i] ?? '0').join('')
  return createHash('sha256')
    .update(`${CCH_SALT}${chars}${CLAUDE_CODE_VERSION}`)
    .digest('hex')
    .slice(0, 3)
}

function buildBillingHeader(userText: string): string {
  const suffix = computeVersionSuffix(userText)
  const cch = computeCch(userText)
  return (
    `x-anthropic-billing-header: cc_version=${CLAUDE_CODE_VERSION}.${suffix}; ` +
    `cc_entrypoint=${CLAUDE_CODE_ENTRYPOINT}; cch=${cch};`
  )
}

/** OAuth Pro requests must use the Claude Code identity in system[] only. */
export function buildClaudeOAuthBody(input: {
  query: string
  systemPrompt?: string
  maxTokens?: number
  model?: string
}): Record<string, unknown> {
  const userContent = input.systemPrompt?.trim()
    ? `${input.systemPrompt.trim()}\n\n${input.query}`
    : input.query

  const billing = buildBillingHeader(userContent)
  const systemText = `${billing}\n\n${CLAUDE_CODE_IDENTITY}`

  return {
    model: input.model ?? 'claude-sonnet-4-20250514',
    max_tokens: input.maxTokens ?? 1024,
    system: [{ type: 'text', text: systemText }],
    messages: [{ role: 'user', content: userContent }]
  }
}

export function parseAnthropicError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { type?: string; message?: string }
      type?: string
    }
    const err = parsed.error ?? parsed
    const type = err.type ?? parsed.type
    const msg = err.message

    if (type === 'rate_limit_error') {
      return 'Claude rate limit — wait 30–60s and retry. Heavy research queries may hit Pro limits; try @perplexity ask: …'
    }
    if (type === 'authentication_error') {
      return 'Claude session expired — go to Integrations → Claude → Reconnect.'
    }
    if (type === 'overloaded_error') {
      return 'Claude is overloaded — try again in a moment.'
    }
    if (msg && msg !== 'Error') return msg
    if (type) return `Claude API error (${type})`
  } catch {
    // not JSON
  }
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

export async function fetchClaudeOAuth(
  accessToken: string,
  body: Record<string, unknown>,
  attempts = 3
): Promise<Response> {
  const url = 'https://api.anthropic.com/v1/messages?beta=true'
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20,interleaved-thinking-2025-05-14',
    'User-Agent': 'claude-cli/2.1.87 (external, cli)'
  }

  let lastRes: Response | null = null
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    lastRes = res
    if (res.status !== 429 || i === attempts - 1) return res

    const retryAfter = res.headers.get('retry-after')
    const delayMs =
      retryAfter && /^\d+$/.test(retryAfter)
        ? parseInt(retryAfter, 10) * 1000
        : 1000 * Math.pow(2, i)
    await sleep(delayMs)
  }
  return lastRes!
}
