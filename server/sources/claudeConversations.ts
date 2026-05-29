import { readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Server as SocketServer } from 'socket.io'
import { normalizeClaudeConversation } from '../normalizer'
import { itemExists, upsertItems } from '../db'
import type { StreamItem } from '../../shared/types'

function projectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

function decodeProjectSlug(slug: string): string {
  if (!slug.startsWith('-')) return slug
  return slug
    .slice(1)
    .split('-')
    .map((part, i) => (i === 0 ? part : part))
    .join('/')
    .replace(/^Users\//, '~/')
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as { type?: string; text?: string; thinking?: string }
    if (b.type === 'text' && b.text) parts.push(b.text)
    if (b.type === 'thinking' && b.thinking) parts.push(b.thinking.slice(0, 200))
  }
  return parts.join('\n').trim()
}

function parseSessionFile(
  filePath: string,
  projectSlug: string,
  sessionId: string
): StreamItem | null {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  const lines = raw.split('\n').filter(Boolean)
  if (lines.length === 0) return null

  let firstUser = ''
  let lastAssistant = ''
  let lastTs = statSync(filePath).mtime

  for (const line of lines) {
    let entry: {
      type?: string
      timestamp?: string | number
      message?: { role?: string; content?: unknown }
    }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }

    if (entry.timestamp) {
      const ts =
        typeof entry.timestamp === 'number'
          ? new Date(entry.timestamp)
          : new Date(entry.timestamp)
      if (!Number.isNaN(ts.getTime())) lastTs = ts
    }

    const role = entry.message?.role ?? entry.type
    const text = extractText(entry.message?.content)
    if (!text) continue

    if (role === 'user' && !firstUser) firstUser = text
    if (role === 'assistant' || entry.type === 'assistant') {
      lastAssistant = text
    }
  }

  const title = firstUser.slice(0, 120) || `Claude session ${sessionId.slice(0, 8)}`
  const body = lastAssistant || firstUser || 'Claude conversation'
  const projectLabel = decodeProjectSlug(projectSlug)

  return normalizeClaudeConversation({
    sessionId,
    projectSlug,
    projectLabel,
    title,
    body,
    updatedAt: lastTs,
    messageCount: lines.length
  })
}

export function listClaudeConversationPaths(): string[] {
  const root = projectsRoot()
  if (!existsSafe(root)) return []

  const files: string[] = []
  for (const projectDir of readdirSync(root)) {
    const projectPath = join(root, projectDir)
    if (!isDir(projectPath)) continue

    for (const name of readdirSync(projectPath)) {
      if (!name.endsWith('.jsonl')) continue
      files.push(join(projectPath, name))
    }

    const sessionsDir = join(projectPath, 'sessions')
    if (isDir(sessionsDir)) {
      for (const name of readdirSync(sessionsDir)) {
        if (!name.endsWith('.jsonl')) continue
        files.push(join(sessionsDir, name))
      }
    }
  }

  return files.sort(
    (a, b) => (statSync(b).mtimeMs ?? 0) - (statSync(a).mtimeMs ?? 0)
  )
}

function existsSafe(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export async function syncClaudeConversations(io?: SocketServer): Promise<StreamItem[]> {
  const files = listClaudeConversationPaths().slice(0, 40)
  const items: StreamItem[] = []

  for (const filePath of files) {
    const parts = filePath.split(/[/\\]/)
    const fileName = parts.at(-1) ?? ''
    const sessionId = fileName.replace(/\.jsonl$/, '')
    const projectSlug = parts.at(-3) === 'sessions' ? parts.at(-4)! : parts.at(-2)!
    const item = parseSessionFile(filePath, projectSlug, sessionId)
    if (item) items.push(item)
  }

  if (items.length > 0) {
    const fresh = items.filter((i) => !itemExists(i.id))
    upsertItems(items)
    for (const item of fresh) io?.emit('stream:item', item)
  }

  return items
}
