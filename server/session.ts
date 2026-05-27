import { randomBytes } from 'crypto'
import type { Request, Response } from 'express'
import { memoryStore } from './memory-store'

const COOKIE_NAME = 'stream_sid'
const MAX_AGE = 60 * 60 * 24 * 365

const useMemory = () => !!process.env.VERCEL

const SESSION_SCHEMA = `
CREATE TABLE IF NOT EXISTS session_tokens (
  session_id TEXT NOT NULL,
  source TEXT NOT NULL,
  token_json TEXT NOT NULL,
  PRIMARY KEY (session_id, source)
);
CREATE TABLE IF NOT EXISTS session_meta (
  session_id TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL
);
`

let schemaReady = false

function ensureSessionSchema(): void {
  if (useMemory() || schemaReady) return
  const { getDb } = require('./db-sqlite') as typeof import('./db-sqlite')
  getDb().exec(SESSION_SCHEMA)
  schemaReady = true
}

export function getSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[COOKIE_NAME] as string | undefined
  if (existing) return existing

  const sid = randomBytes(24).toString('hex')
  const secure = process.env.NODE_ENV === 'production'
  res.cookie(COOKIE_NAME, sid, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: MAX_AGE * 1000,
    path: '/'
  })
  return sid
}

export function readSessionId(req: Request): string | undefined {
  return req.cookies?.[COOKIE_NAME] as string | undefined
}

export function getToken(sessionId: string, source: string): Record<string, unknown> | undefined {
  if (useMemory()) return memoryStore.getToken(sessionId, source)
  ensureSessionSchema()
  const { getDb } = require('./db-sqlite') as typeof import('./db-sqlite')
  const row = getDb()
    .prepare('SELECT token_json FROM session_tokens WHERE session_id = ? AND source = ?')
    .get(sessionId, source) as { token_json: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.token_json) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function setToken(
  sessionId: string,
  source: string,
  token: Record<string, unknown>
): void {
  if (useMemory()) {
    memoryStore.setToken(sessionId, source, token)
    return
  }
  ensureSessionSchema()
  const { getDb } = require('./db-sqlite') as typeof import('./db-sqlite')
  getDb()
    .prepare(
      `INSERT INTO session_tokens (session_id, source, token_json) VALUES (?, ?, ?)
       ON CONFLICT(session_id, source) DO UPDATE SET token_json = excluded.token_json`
    )
    .run(sessionId, source, JSON.stringify(token))
}

type SessionMeta = {
  connections: {
    gmail: boolean
    slack: boolean
    x: boolean
    monday: boolean
    discord: boolean
    perplexity: boolean
  }
  preferences: { xMinEngagement: number; onboardingComplete: boolean }
}

const DEFAULT_META: SessionMeta = {
  connections: {
    gmail: false,
    slack: false,
    x: false,
    monday: false,
    discord: false,
    perplexity: false
  },
  preferences: { xMinEngagement: 0, onboardingComplete: false }
}

export function getMeta(sessionId: string): SessionMeta {
  if (useMemory()) {
    const raw = memoryStore.getMeta(sessionId)
    if (!raw) return { ...DEFAULT_META, connections: { ...DEFAULT_META.connections } }
    try {
      const parsed = JSON.parse(raw) as SessionMeta
      return {
        connections: { ...DEFAULT_META.connections, ...parsed.connections },
        preferences: { ...DEFAULT_META.preferences, ...parsed.preferences }
      }
    } catch {
      return { ...DEFAULT_META, connections: { ...DEFAULT_META.connections } }
    }
  }

  ensureSessionSchema()
  const { getDb } = require('./db-sqlite') as typeof import('./db-sqlite')
  const row = getDb()
    .prepare('SELECT meta_json FROM session_meta WHERE session_id = ?')
    .get(sessionId) as { meta_json: string } | undefined
  if (!row) return { ...DEFAULT_META, connections: { ...DEFAULT_META.connections } }
  try {
    const parsed = JSON.parse(row.meta_json) as SessionMeta
    return {
      connections: { ...DEFAULT_META.connections, ...parsed.connections },
      preferences: { ...DEFAULT_META.preferences, ...parsed.preferences }
    }
  } catch {
    return { ...DEFAULT_META, connections: { ...DEFAULT_META.connections } }
  }
}

export function setMeta(sessionId: string, meta: SessionMeta): void {
  if (useMemory()) {
    memoryStore.setMeta(sessionId, JSON.stringify(meta))
    return
  }
  ensureSessionSchema()
  const { getDb } = require('./db-sqlite') as typeof import('./db-sqlite')
  getDb()
    .prepare(
      `INSERT INTO session_meta (session_id, meta_json) VALUES (?, ?)
       ON CONFLICT(session_id) DO UPDATE SET meta_json = excluded.meta_json`
    )
    .run(sessionId, JSON.stringify(meta))
}

export function getConnections(sessionId: string): SessionMeta['connections'] {
  return getMeta(sessionId).connections
}

export function setConnection(
  sessionId: string,
  source: keyof SessionMeta['connections'],
  connected: boolean
): void {
  const meta = getMeta(sessionId)
  meta.connections[source] = connected
  setMeta(sessionId, meta)
}

export function getNested<T>(sessionId: string, path: string[]): T | undefined {
  const meta = getMeta(sessionId)
  let current: unknown = meta
  for (const segment of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current as T
}

export function setNested(sessionId: string, path: string[], value: unknown): void {
  const meta = getMeta(sessionId)
  if (path.length === 0) return
  let current: Record<string, unknown> = meta as unknown as Record<string, unknown>
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    if (typeof current[segment] !== 'object' || current[segment] === null) {
      current[segment] = {}
    }
    current = current[segment] as Record<string, unknown>
  }
  current[path[path.length - 1]] = value
  setMeta(sessionId, meta)
}
