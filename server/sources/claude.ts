import type { Server as SocketServer } from 'socket.io'
import { normalizeAiAssist } from '../normalizer'
import { upsertItem } from '../db'
import type { StreamItem } from '../../shared/types'
import { apiKey, connectWithToken, getIntegrationToken, isTokenConnected } from './integrationTokens'
import * as session from '../session'
import {
  getValidClaudeOAuth,
  connectClaudeOAuthWithKey,
  createClaudeApiKeyFromOAuth,
  getClaudeDerivedApiKey,
  storeClaudeOAuth,
  type ClaudeOAuthCreds
} from './claudeOAuth'
import { syncClaudeConversations } from './claudeConversations'
import {
  buildClaudeOAuthBody,
  fetchClaudeOAuth,
  parseAnthropicError
} from './claudeOAuthRequest'

const API_URL = 'https://api.anthropic.com/v1/messages'

export function connectClaude(apiKeyValue: string): void {
  connectWithToken('claude', { authType: 'api_key', apiKey: apiKeyValue })
}

/** Seed ANTHROPIC_API_KEY into a session when env is set (local dev). */
export function ensureClaudeFromEnv(sessionId: string): boolean {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return false
  const existing = session.getToken(sessionId, 'claude')
  if (existing?.apiKey || existing?.accessToken) return true
  session.setToken(sessionId, 'claude', { authType: 'api_key', apiKey: key })
  session.setConnection(sessionId, 'claude', true)
  return true
}

export function connectClaudeOAuth(creds: ClaudeOAuthCreds): void {
  storeClaudeOAuth(creds)
}

export async function connectClaudeOAuthAsync(creds: ClaudeOAuthCreds): Promise<void> {
  await connectClaudeOAuthWithKey(creds)
}

export function isClaudeConnected(): boolean {
  return isTokenConnected('claude') || Boolean(getIntegrationToken('claude')?.accessToken)
}

export function claudeAccountLabel(): string | undefined {
  const t = getIntegrationToken('claude')
  if (t?.authType === 'oauth') {
    const tier = t.subscriptionType ? String(t.subscriptionType) : 'Pro'
    return `Claude ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`
  }
  if (t?.apiKey || t?.authType === 'api_key') return 'Claude API key'
  return undefined
}

function inferenceKey(): string | undefined {
  return getClaudeDerivedApiKey() ?? apiKey('claude')
}

async function queryWithApiKey(
  key: string,
  query: string,
  systemPrompt: string,
  opts?: { thinking?: boolean }
): Promise<Response> {
  const thinking = opts?.thinking
  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      ...(thinking ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' } : {})
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: thinking ? 16000 : 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
      ...(thinking ? { thinking: { type: 'enabled', budget_tokens: 8000 } } : {})
    })
  })
}

async function ensureDerivedKey(oauth: ClaudeOAuthCreds): Promise<string | null> {
  const existing = getClaudeDerivedApiKey()
  if (existing) return existing
  const derived = await createClaudeApiKeyFromOAuth(oauth.accessToken)
  if (derived) {
    connectWithToken('claude', {
      authType: 'oauth',
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
      subscriptionType: oauth.subscriptionType,
      derivedApiKey: derived
    })
  }
  return derived
}

export async function queryClaude(
  query: string,
  systemPrompt: string,
  opts?: { thinking?: boolean }
): Promise<StreamItem & { thinking?: string }> {
  const oauth = await getValidClaudeOAuth()
  let key = inferenceKey()

  if (!oauth && !key) throw new Error('Claude not connected')

  let res: Response
  let usedOAuth = false

  if (key) {
    res = await queryWithApiKey(key, query, systemPrompt, opts)
  } else if (oauth) {
    usedOAuth = true
    // thinking not supported via OAuth path — falls through to API key
    const body = buildClaudeOAuthBody({ query, systemPrompt })
    res = await fetchClaudeOAuth(oauth.accessToken, body)
  } else {
    throw new Error('Claude not connected')
  }

  // OAuth rate-limited → derive console API key and retry (Claude Code pattern)
  if (!res.ok && res.status === 429 && oauth) {
    const derived = await ensureDerivedKey(oauth)
    if (derived) {
      key = derived
      res = await queryWithApiKey(derived, query, systemPrompt, opts)
      usedOAuth = false
    } else if (usedOAuth) {
      const haikuBody = buildClaudeOAuthBody({
        query,
        systemPrompt,
        model: 'claude-3-5-haiku-20241022'
      })
      res = await fetchClaudeOAuth(oauth.accessToken, haikuBody, 1)
    }
  }

  if (!res.ok) {
    throw new Error(parseAnthropicError(await res.text()))
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string; thinking?: string }[]
  }
  const answer =
    data.content?.find((c) => c.type === 'text')?.text?.trim() ??
    'Claude returned an empty response.'
  const thinking = data.content?.find((c) => c.type === 'thinking')?.thinking

  const item = normalizeAiAssist({
    source: 'claude',
    query,
    answer,
    senderName: oauth || key ? 'Claude Pro' : 'Claude',
    handle: 'claude',
    metadata: {
      model: 'claude-sonnet-4-20250514',
      authType: usedOAuth ? 'oauth' : key ? 'api_key' : 'oauth'
    }
  })
  return thinking ? { ...item, thinking } : item
}

export async function askClaude(
  query: string,
  systemPrompt: string,
  io?: SocketServer
): Promise<StreamItem> {
  const item = await queryClaude(query, systemPrompt)
  upsertItem(item)
  io?.emit('stream:item', item)
  return item
}

export async function syncClaude(io?: SocketServer): Promise<StreamItem[]> {
  if (!isClaudeConnected()) return []
  return syncClaudeConversations(io)
}

export async function refreshClaudeApiAccess(): Promise<boolean> {
  const oauth = await getValidClaudeOAuth()
  if (!oauth) return false
  const derived = await createClaudeApiKeyFromOAuth(oauth.accessToken)
  if (!derived) return false
  connectWithToken('claude', {
    authType: 'oauth',
    accessToken: oauth.accessToken,
    refreshToken: oauth.refreshToken,
    expiresAt: oauth.expiresAt,
    subscriptionType: oauth.subscriptionType,
    derivedApiKey: derived
  })
  return true
}
