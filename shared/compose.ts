/** Unified @tag compose commands for bidirectional integrations. */

export const COMPOSE_PROVIDERS = [
  'monday',
  'gmail',
  'slack',
  'discord',
  'x',
  'perplexity',
  'claude',
  'cursor',
  'github',
  'gemini',
  'gdocs',
  'gong',
  'mind'
] as const

export type ComposeProvider = (typeof COMPOSE_PROVIDERS)[number]

export type ComposeCommand = {
  provider: ComposeProvider
  intent: string
  /** Board name, channel, item id, email, repo, doc id, etc. */
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
  pplx: 'perplexity',
  claude: 'claude',
  anthropic: 'claude',
  cursor: 'cursor',
  github: 'github',
  gh: 'github',
  gemini: 'gemini',
  gdocs: 'gdocs',
  docs: 'gdocs',
  gong: 'gong',
  mind: 'mind',
  kb: 'mind',
  think: 'mind'
}

export function parseComposeCommand(raw: string): ComposeCommand | null {
  const text = raw.trim()
  const head = text.match(/^@?([a-z0-9_]+)\b\s*(.*)$/is)
  if (!head?.[1]) return null

  const provider = PROVIDER_ALIASES[head[1].toLowerCase()]
  if (!provider) return null

  const rest = head[2].trim().replace(/^:\s*/, '')
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

  const githubIssue = rest.match(/^#(\d+)\s+comment\s*:\s*(.+)$/is)
  if (provider === 'github' && githubIssue) {
    return {
      provider,
      target: githubIssue[1],
      intent: 'comment',
      body: githubIssue[2].trim(),
      raw: text
    }
  }

  const repoCreate = rest.match(/^([\w.-]+\/[\w.-]+)\s*:\s*(.+)$/is)
  if (provider === 'github' && repoCreate) {
    const slash = repoCreate[2].indexOf(' / ')
    return {
      provider,
      target: repoCreate[1],
      intent: 'create',
      body: repoCreate[2].trim(),
      raw: text
    }
  }

  const gdocsAppend = rest.match(/^#([\w-]+)\s+append\s*:\s*(.+)$/is)
  if (provider === 'gdocs' && gdocsAppend) {
    return {
      provider,
      target: gdocsAppend[1],
      intent: 'append',
      body: gdocsAppend[2].trim(),
      raw: text
    }
  }

  const gongNote = rest.match(/^#([\w-]+)\s+note\s*:\s*(.+)$/is)
  if (provider === 'gong' && gongNote) {
    return {
      provider,
      target: gongNote[1],
      intent: 'note',
      body: gongNote[2].trim(),
      raw: text
    }
  }

  const intentMatch = rest.match(/^(reply|send|post|ask|comment|create|move|append|note|draft|issue)\s*(?:to|:)\s*(.+)$/is)
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
        : provider === 'github'
          ? 'create'
          : provider === 'gdocs'
            ? 'create'
            : provider === 'gong'
              ? 'note'
              : provider === 'mind'
                ? 'capture'
                : provider === 'perplexity' ||
                  provider === 'claude' ||
                  provider === 'gemini' ||
                  provider === 'cursor'
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
      '@monday: Add to new ideas section — Phase 1 sim calls, Phase 2 agency network',
      '@monday Fix Frankfurt webhook policy',
      '@monday/Development Kanban: Spike OAuth',
      '@monday #123456789 comment: shipped v1'
    ]
  },
  {
    provider: 'gmail',
    examples: ['@gmail reply: Thanks — pilot starts Monday', '@gmail send user@co.com: Re: Pilot / Sounds good']
  },
  { provider: 'slack', examples: ['@slack #general: Customer asked about Frankfurt region'] },
  { provider: 'discord', examples: ['@discord #dev: Deploy blocked on webhook retries'] },
  { provider: 'x', examples: ['@x post: Shipping ambient work OS for GTM teams'] },
  { provider: 'perplexity', examples: ['@perplexity ask: SOC2 timeline for B2B SaaS'] },
  { provider: 'claude', examples: ['@claude ask: Draft reply to security questionnaire', '@claude draft: Follow-up email after demo'] },
  { provider: 'gemini', examples: ['@gemini ask: Summarize this deal thread'] },
  { provider: 'cursor', examples: ['@cursor ask: Fix Gmail thread reply blade layout'] },
  {
    provider: 'github',
    examples: ['@github org/repo: Fix webhook retries / root cause…', '@github #42 comment: patch shipped']
  },
  { provider: 'gdocs', examples: ['@gdocs create: Q2 pilot notes / Agenda and owners…', '@gdocs #DOC_ID append: Action items from call'] },
  { provider: 'gong', examples: ['@gong #CALL_ID note: Customer wants EU residency confirmed'] },
  {
    provider: 'mind',
    examples: [
      '@mind GraphRAG velocity should weight intention not just semantic similarity',
      '@mind #learning [[ontology]] plan: ingest feed traces with time-to-action'
    ]
  }
]
