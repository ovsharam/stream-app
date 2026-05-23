/**
 * Session-scoped store — tokens in SQLite per session, keyed by httpOnly cookie.
 */
import { getSessionIdFromContext } from './request-context'
import * as session from './session'

export function getToken(source: string): Record<string, unknown> | undefined {
  return session.getToken(getSessionIdFromContext(), source)
}

export function setToken(source: string, token: Record<string, unknown>): void {
  session.setToken(getSessionIdFromContext(), source, token)
}

export function getConnections(): ReturnType<typeof session.getConnections> {
  return session.getConnections(getSessionIdFromContext())
}

export function setConnection(
  source: keyof ReturnType<typeof session.getConnections>,
  connected: boolean
): void {
  session.setConnection(getSessionIdFromContext(), source, connected)
}

export function getNested<T>(path: string[]): T | undefined {
  return session.getNested<T>(getSessionIdFromContext(), path)
}

export function setNested(path: string[], value: unknown): void {
  session.setNested(getSessionIdFromContext(), path, value)
}

/** @deprecated file store removed — no-op for compat */
export function initStore(_dataDir: string): void {}
