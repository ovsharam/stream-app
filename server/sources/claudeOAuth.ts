import { createHash, randomBytes } from 'crypto'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { connectWithToken, getIntegrationToken } from './integrationTokens'

export const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
export const CLAUDE_OAUTH_REDIRECT = 'https://platform.claude.com/oauth/code/callback'
export const CLAUDE_OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const CLAUDE_OAUTH_SCOPE =
  'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'

export type ClaudeOAuthCreds = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  subscriptionType?: string
}

const pendingPkce = new Map<string, { verifier: string; createdAt: number }>()
const PKCE_TTL_MS = 10 * 60_000

function prunePkce(): void {
  const now = Date.now()
  for (const [key, val] of pendingPkce) {
    if (now - val.createdAt > PKCE_TTL_MS) pendingPkce.delete(key)
  }
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildClaudeOAuthUrl(sessionId: string): string {
  prunePkce()
  const { verifier, challenge } = generatePkce()
  pendingPkce.set(sessionId, { verifier, createdAt: Date.now() })

  const url = new URL('https://claude.ai/oauth/authorize')
  url.searchParams.set('code', 'true')
  url.searchParams.set('client_id', CLAUDE_OAUTH_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', CLAUDE_OAUTH_REDIRECT)
  url.searchParams.set('scope', CLAUDE_OAUTH_SCOPE)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', verifier)
  return url.toString()
}

function parseCredentialBlob(raw: string): ClaudeOAuthCreds | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const data = (parsed as { claudeAiOauth?: unknown }).claudeAiOauth ?? parsed
  const creds = data as {
    accessToken?: unknown
    refreshToken?: unknown
    expiresAt?: unknown
    subscriptionType?: unknown
  }

  if (
    typeof creds.accessToken !== 'string' ||
    typeof creds.refreshToken !== 'string' ||
    typeof creds.expiresAt !== 'number'
  ) {
    return null
  }

  return {
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    expiresAt: creds.expiresAt,
    subscriptionType:
      typeof creds.subscriptionType === 'string' ? creds.subscriptionType : undefined
  }
}

function readKeychainCredentials(): ClaudeOAuthCreds | null {
  if (process.platform !== 'darwin') return null
  try {
    const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
      timeout: 3000,
      encoding: 'utf-8'
    }).trim()
    return parseCredentialBlob(raw)
  } catch {
    return null
  }
}

function readFileCredentials(): ClaudeOAuthCreds | null {
  try {
    const path = join(homedir(), '.claude', '.credentials.json')
    if (!existsSync(path)) return null
    return parseCredentialBlob(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function detectLocalClaudeAccount(): {
  label: string
  subscriptionType?: string
} | null {
  const creds = readKeychainCredentials() ?? readFileCredentials()
  if (!creds) return null
  const tier = creds.subscriptionType
    ? creds.subscriptionType.charAt(0).toUpperCase() + creds.subscriptionType.slice(1)
    : 'Pro'
  return { label: `Claude ${tier}`, subscriptionType: creds.subscriptionType }
}

export function importLocalClaudeCredentials(): ClaudeOAuthCreds {
  const creds = readKeychainCredentials() ?? readFileCredentials()
  if (!creds) {
    throw new Error(
      'No Claude account found locally. Install Claude Code (`npm i -g @anthropic-ai/claude-code`) and run `claude login`, or use Sign in with Claude below.'
    )
  }
  return creds
}

export function storeClaudeOAuth(creds: ClaudeOAuthCreds): void {
  connectWithToken('claude', {
    authType: 'oauth',
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    expiresAt: creds.expiresAt,
    subscriptionType: creds.subscriptionType
  })
}

/** Derive a console API key from OAuth — avoids Pro OAuth rate limits on /v1/messages. */
export async function createClaudeApiKeyFromOAuth(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/claude_cli/create_api_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'claude-cli/2.1.87 (external, cli)'
      }
    })
    if (!res.ok) return null
    const data = (await res.json()) as { raw_key?: string }
    return data.raw_key?.trim() || null
  } catch {
    return null
  }
}

export async function connectClaudeOAuthWithKey(creds: ClaudeOAuthCreds): Promise<void> {
  storeClaudeOAuth(creds)
  const derived = await createClaudeApiKeyFromOAuth(creds.accessToken)
  if (derived) {
    connectWithToken('claude', {
      authType: 'oauth',
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      subscriptionType: creds.subscriptionType,
      derivedApiKey: derived
    })
  }
}

export function getClaudeDerivedApiKey(): string | undefined {
  const t = getIntegrationToken('claude')
  return String(t?.derivedApiKey ?? '').trim() || undefined
}

export function getStoredClaudeOAuth(): ClaudeOAuthCreds | null {
  const t = getIntegrationToken('claude')
  if (t?.authType !== 'oauth') return null
  const accessToken = String(t.accessToken ?? '')
  const refreshToken = String(t.refreshToken ?? '')
  const expiresAt = Number(t.expiresAt ?? 0)
  if (!accessToken || !refreshToken || !expiresAt) return null
  return {
    accessToken,
    refreshToken,
    expiresAt,
    subscriptionType: t.subscriptionType ? String(t.subscriptionType) : undefined
  }
}

export async function exchangeClaudeOAuthCode(
  sessionId: string,
  codeRaw: string
): Promise<ClaudeOAuthCreds> {
  prunePkce()
  const pending = pendingPkce.get(sessionId)
  pendingPkce.delete(sessionId)

  const [codePart, statePart = ''] = codeRaw.trim().split('#')
  const code = codePart.trim()
  const verifier = pending?.verifier ?? statePart.trim()
  if (!code || !verifier) {
    throw new Error('Missing authorization code — paste the full code from the Claude sign-in page.')
  }

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    redirect_uri: CLAUDE_OAUTH_REDIRECT,
    code_verifier: verifier
  })
  if (statePart) params.set('state', statePart)

  const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'claude-cli/2.1.87 (external, cli)'
    },
    body: params.toString()
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error('Claude OAuth did not return tokens')
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 36_000) * 1000
  }
}

export async function refreshClaudeOAuth(creds: ClaudeOAuthCreds): Promise<ClaudeOAuthCreds> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refreshToken,
    client_id: CLAUDE_OAUTH_CLIENT_ID
  })

  const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'claude-cli/2.1.87 (external, cli)'
    },
    body: params.toString()
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const data = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }

  if (!data.access_token) throw new Error('Claude token refresh failed')

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 36_000) * 1000,
    subscriptionType: creds.subscriptionType
  }
}

export async function getValidClaudeOAuth(): Promise<ClaudeOAuthCreds | null> {
  const creds = getStoredClaudeOAuth()
  if (!creds) return null
  if (creds.expiresAt > Date.now() + 60_000) return creds
  try {
    const refreshed = await refreshClaudeOAuth(creds)
    storeClaudeOAuth(refreshed)
    return refreshed
  } catch {
    return null
  }
}
