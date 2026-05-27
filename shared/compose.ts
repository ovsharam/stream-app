/** Unified @tag compose commands for bidirectional integrations. */

export const COMPOSE_PROVIDERS = [
  'monday',
  'gmail',
  'slack',
  'discord',
  'x',
  'perplexity'
] as const

export type ComposeProvider = (typeof COMPOSE_PROVIDERS)[number]

export type ComposeCommand = {
  provider: ComposeProvider
  intent: string
  /** Board name, channel, item id, email, etc. */
  target?: string
  body: string
  raw: string
}

const PROVIDER_ALIASES: Record<string, ComposeProvider> = {
  monday: 'monday',
  gmail: 'gmail',
  google: 'gmail',
  slack: 'slack',
  discord: 'discord',
  x: 'x',
  twitter: 'x',
  perplexity: 'perplexity',
  pplx: 'perplexity'
}

export function parseComposeCommand(raw: string): ComposeCommand | null {
  const text = raw.trim()
  const head = text.match(/^@?([a-z0-9_]+)\b\s*(.*)$/is)
  if (!head?.[1]) return null

  const provider = PROVIDER_ALIASES[head[1].toLowerCase()]
  if (!provider) return null

  const rest = head[2].trim()
  if (!rest) return null

  const mondayItem = rest.match(/^#(\d+)\s+(comment|move|update)\s*(?:to|:)?\s*(.+)$/is)
  if (provider === 'monday' && mondayItem) {
    return {
      provider,
      target: mondayItem[1],
      intent: mondayItem[2].toLowerCase() === 'update' ? 'move' : mondayItem[2].toLowerCase(),
      body: mondayItem[3].trim(),
      raw: text
    }
  }

  const boardCreate = rest.match(/^\/([^:\n]+)\s*:\s*(.+)$/is)
  if (provider === 'monday' && boardCreate) {
    return {
      provider,
      target: boardCreate[1].trim(),
      intent: 'create',
      body: boardCreate[2].trim(),
      raw: text
    }
  }

  const channelPost = rest.match(/^#([\w-]+)\s*:\s*(.+)$/is)
  if (channelPost && (provider === 'slack' || provider === 'discord')) {
    return {
      provider,
      target: channelPost[1],
      intent: 'post',
      body: channelPost[2].trim(),
      raw: text
    }
  }

  const intentMatch = rest.match(/^(reply|send|post|ask|comment|create|move)\s*(?:to|:)\s*(.+)$/is)
  if (intentMatch) {
    return {
      provider,
      intent: intentMatch[1].toLowerCase(),
      body: intentMatch[2].trim(),
      raw: text
    }
  }

  const gmailSend = rest.match(/^send\s+([\w.+-]+@[\w.-]+)\s*:\s*(.+)$/is)
  if (provider === 'gmail' && gmailSend) {
    return {
      provider,
      target: gmailSend[1],
      intent: 'send',
      body: gmailSend[2].trim(),
      raw: text
    }
  }

  const defaultIntent =
    provider === 'monday'
      ? 'create'
      : provider === 'gmail'
        ? 'reply'
        : provider === 'perplexity'
          ? 'ask'
          : 'post'

  return { provider, intent: defaultIntent, body: rest, raw: text }
}

export function isComposeAction(raw: string): boolean {
  return parseComposeCommand(raw) != null
}

export const COMPOSE_HELP: { provider: ComposeProvider; examples: string[] }[] = [
  {
    provider: 'monday',
    examples: [
      '@monday Fix Frankfurt webhook policy',
      '@monday/Development Kanban: Spike OAuth',
      '@monday #123456789 comment: shipped v1'
    ]
  },
  {
    provider: 'gmail',
    examples: ['@gmail reply: Thanks — pilot starts Monday', '@gmail send user@co.com: Re: Pilot / Sounds good']
  },
  {
    provider: 'slack',
    examples: ['@slack #general: Customer asked about Frankfurt region']
  },
  {
    provider: 'discord',
    examples: ['@discord #dev: Deploy blocked on webhook retries']
  },
  { provider: 'x', examples: ['@x post: Shipping ambient work OS for GTM teams'] },
  { provider: 'perplexity', examples: ['@perplexity ask: SOC2 timeline for B2B SaaS'] }
]
