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
  'mind',
  'calcom'
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
  think: 'mind',
  calcom: 'calcom',
  cal: 'calcom'
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

  const calcomBook = rest.match(/^book\s*:\s*(.+)$/is)
  if (provider === 'calcom' && calcomBook) {
    return {
      provider,
      intent: 'book',
      body: calcomBook[1].trim(),
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

  const intentMatch = rest.match(/^(reply|send|post|ask|comment|create|move|append|note|draft|issue|book)\s*(?:to|:)\s*(.+)$/is)
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

const COMPOSE_CMD_RE =
  /@(?:monday|gmail|google|slack|discord|x|twitter|perplexity|pplx|claude|anthropic|cursor|github|gh|gemini|gdocs|docs|gong|mind|kb|think|calcom|cal)\b[^\n]*/gi

/** Pull validated @provider compose commands from free text (e.g. chat agent handoffs). */
export function extractComposeCommands(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const matches = text.match(COMPOSE_CMD_RE) ?? []
  for (const raw of matches) {
    let cmd = raw.trim().replace(/^[-*•]\s+/, '').replace(/^["'`]+|["'`]+$/g, '')
    if (!cmd.startsWith('@')) cmd = `@${cmd}`
    if (seen.has(cmd)) continue
    if (!parseComposeCommand(cmd)) continue
    seen.add(cmd)
    out.push(cmd)
  }
  return out
}

export type ComposeSuggestion = {
  label: string
  insert: string
  hint?: string
}

/** Short command chips shown after @provider in compose — only where relevant. */
export const COMPOSE_SUGGESTIONS: Partial<Record<ComposeProvider, ComposeSuggestion[]>> = {
  monday: [
    { label: 'create:', insert: 'create: ', hint: 'New task' },
    { label: '#ID comment:', insert: '#123456789 comment: ', hint: 'Comment on item' },
    { label: '/Board:', insert: '/Board name: ', hint: 'Create on board' }
  ],
  gmail: [
    { label: 'reply:', insert: 'reply: ', hint: 'Reply in thread' },
    { label: 'send:', insert: 'send user@co.com: ', hint: 'New email' }
  ],
  slack: [{ label: '#channel:', insert: '#general: ', hint: 'Post to channel' }],
  discord: [{ label: '#channel:', insert: '#dev: ', hint: 'Post to channel' }],
  x: [{ label: 'post:', insert: 'post: ', hint: 'Publish tweet' }],
  perplexity: [{ label: 'ask:', insert: 'ask: ', hint: 'Research query' }],
  claude: [
    { label: 'ask:', insert: 'ask: ', hint: 'Question or task' },
    { label: 'draft:', insert: 'draft: ', hint: 'Draft copy' }
  ],
  gemini: [{ label: 'ask:', insert: 'ask: ', hint: 'Question or task' }],
  cursor: [{ label: 'ask:', insert: 'ask: ', hint: 'Launch build agent' }],
  github: [
    { label: 'org/repo:', insert: 'org/repo: ', hint: 'New issue' },
    { label: '#ID comment:', insert: '#42 comment: ', hint: 'Comment on issue' }
  ],
  gdocs: [
    { label: 'create:', insert: 'create: ', hint: 'New doc' },
    { label: '#ID append:', insert: '#DOC_ID append: ', hint: 'Append to doc' }
  ],
  gong: [{ label: '#ID note:', insert: '#CALL_ID note: ', hint: 'Call note' }],
  mind: [{ label: 'capture', insert: '', hint: 'Freeform KB note' }],
  calcom: [{ label: 'book:', insert: 'book: ', hint: 'Schedule meeting' }]
}

export function resolveComposeProvider(token: string): ComposeProvider | null {
  return PROVIDER_ALIASES[token.toLowerCase()] ?? null
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** HTML for mirror layer — @provider tags styled blue. */
export function formatComposeHighlight(text: string): string {
  const escaped = escapeHtml(text)
  return escaped.replace(/(^|[\s\n])@([a-z0-9_]+)\b/gi, (full, lead, tag) => {
    if (!resolveComposeProvider(tag)) return full
    return `${lead}<span class="x-compose-tag">@${tag}</span>`
  })
}

export function getActiveComposeContext(
  text: string,
  cursor: number
): {
  provider: ComposeProvider
  providerToken: string
  tagStart: number
  rest: string
  suggestions: ComposeSuggestion[]
} | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|[\s\n])@([a-z0-9_]+)\b([\s\S]*)$/i)
  if (!match?.[1]) return null

  const providerToken = match[1]
  const provider = resolveComposeProvider(providerToken)
  if (!provider) return null

  const tagStart = before.lastIndexOf(`@${providerToken}`)
  const restRaw = match[2] ?? ''
  const rest = restRaw.replace(/^:\s*/, '')

  const all = COMPOSE_SUGGESTIONS[provider] ?? []
  if (all.length === 0) return null

  if (rest.length > 48) return null

  const restLower = rest.trimStart().toLowerCase()
  if (!restLower) {
    return { provider, providerToken, tagStart, rest: restRaw, suggestions: all }
  }

  const filtered = all.filter((s) => {
    const key = s.insert.replace(/:\s*$/, '').toLowerCase()
    const label = s.label.toLowerCase()
    return (
      key.startsWith(restLower) ||
      label.startsWith(restLower) ||
      s.insert.toLowerCase().startsWith(restLower)
    )
  })

  if (filtered.length === 0 && restLower.includes(' ') && rest.length > 12) return null

  return {
    provider,
    providerToken,
    tagStart,
    rest: restRaw,
    suggestions: filtered.length > 0 ? filtered : all
  }
}

export const COMPOSE_HELP: { provider: ComposeProvider; examples: string[] }[] = [
  {
    provider: 'monday',
    examples: [
      'Click a Monday item, then @monday: comment or move to Done on that ticket',
      '@monday create: brand new task (always creates, even with context selected)',
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
  },
  {
    provider: 'calcom',
    examples: [
      '@calcom book: 30min / client@co.com / Jane Doe / auto / Follow-up on webhook scope',
      '@calcom book: discovery / lead@acme.com / Alex / 2026-06-05T15:00:00Z / Technical deep-dive'
    ]
  }
]
