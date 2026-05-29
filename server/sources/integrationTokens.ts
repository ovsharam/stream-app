import { getToken, setToken, setConnection } from '../store'

const CONNECTION_SOURCES = new Set([
  'gmail',
  'slack',
  'x',
  'monday',
  'discord',
  'perplexity',
  'claude',
  'cursor',
  'github',
  'gemini',
  'gdocs',
  'gong'
])

export function connectWithToken(
  source: string,
  token: Record<string, unknown>
): void {
  setToken(source, token)
  if (CONNECTION_SOURCES.has(source)) {
    setConnection(source as Parameters<typeof setConnection>[0], true)
  }
}

export function getIntegrationToken(source: string): Record<string, unknown> | undefined {
  return getToken(source)
}

export function isTokenConnected(source: string): boolean {
  const t = getToken(source)
  if (!t) return false
  return Boolean(t.apiKey || t.token || t.pat || t.accessKey || t.accessToken)
}

export function apiKey(source: string): string | undefined {
  const t = getToken(source)
  return String(t?.apiKey ?? t?.token ?? t?.pat ?? '').trim() || undefined
}
