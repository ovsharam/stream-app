import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Server as SocketServer } from 'socket.io'
import type { CursorBuildMode, CursorBuildStatus, CursorLocalProject } from '../../shared/cursor-build'
import { normalizeAiAssist } from '../normalizer'
import { getRecentItems, upsertItem } from '../db'
import type { StreamItem } from '../../shared/types'
import { apiKey, connectWithToken, getIntegrationToken, isTokenConnected } from './integrationTokens'
import {
  launchLocalCursorAgent,
  listCursorCloudRepos,
  listLocalAgentsForProject,
  verifyCursorAccount
} from './cursorLocal'

const AGENTS_URL = 'https://api.cursor.com/v0/agents'

export type CursorConnectInput = {
  apiKey: string
  repo?: string
  mode?: CursorBuildMode
  localProjects?: CursorLocalProject[]
  activeLocalProjectId?: string
}

function parseLocalProjects(raw: unknown): CursorLocalProject[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => {
      const row = p as Record<string, unknown>
      const path = String(row.path ?? '').trim()
      if (!path) return null
      return {
        id: String(row.id ?? randomUUID()),
        name: String(row.name ?? path.split('/').pop() ?? 'project'),
        path,
        addedAt: String(row.addedAt ?? new Date().toISOString())
      } satisfies CursorLocalProject
    })
    .filter((p): p is CursorLocalProject => p != null)
}

export function getCursorBuildConfig(): {
  apiKey?: string
  repo?: string
  mode: CursorBuildMode
  localProjects: CursorLocalProject[]
  activeLocalProjectId?: string
  accountEmail?: string
  accountName?: string
} {
  const t = getIntegrationToken('cursor') ?? {}
  const mode = (t.mode === 'cloud' ? 'cloud' : 'local') as CursorBuildMode
  return {
    apiKey: apiKey('cursor'),
    repo: String(t.repo ?? process.env.CURSOR_DEFAULT_REPO ?? '').trim() || undefined,
    mode,
    localProjects: parseLocalProjects(t.localProjects),
    activeLocalProjectId: t.activeLocalProjectId
      ? String(t.activeLocalProjectId)
      : undefined,
    accountEmail: t.accountEmail ? String(t.accountEmail) : undefined,
    accountName: t.accountName ? String(t.accountName) : undefined
  }
}

export function getActiveLocalProject(
  config = getCursorBuildConfig()
): CursorLocalProject | undefined {
  if (config.activeLocalProjectId) {
    const hit = config.localProjects.find((p) => p.id === config.activeLocalProjectId)
    if (hit) return hit
  }
  return config.localProjects[0]
}

export function isCursorConnected(): boolean {
  return isTokenConnected('cursor')
}

export function isCursorReadyForBuild(config = getCursorBuildConfig()): boolean {
  if (!config.apiKey) return false
  if (config.mode === 'local') return Boolean(getActiveLocalProject(config)?.path)
  return Boolean(config.repo)
}

export async function connectCursor(input: CursorConnectInput): Promise<{
  ok: boolean
  accountEmail?: string
  accountName?: string
}> {
  const key = input.apiKey.trim()
  const account = await verifyCursorAccount(key)
  if (!account) {
    return { ok: false }
  }

  const prev = getIntegrationToken('cursor') ?? {}
  connectWithToken('cursor', {
    ...prev,
    apiKey: key,
    repo: input.repo?.trim() || prev.repo,
    mode: input.mode ?? prev.mode ?? 'local',
    localProjects: input.localProjects ?? parseLocalProjects(prev.localProjects),
    activeLocalProjectId:
      input.activeLocalProjectId ?? prev.activeLocalProjectId,
    accountEmail: account.email ?? prev.accountEmail,
    accountName: account.name ?? prev.accountName
  })

  return { ok: true, accountEmail: account.email, accountName: account.name }
}

export async function getCursorBuildStatus(): Promise<CursorBuildStatus> {
  const config = getCursorBuildConfig()
  const hasApiKey = Boolean(config.apiKey)
  let cloudRepos: Array<{ url: string; name: string }> | undefined

  if (hasApiKey && config.apiKey) {
    if (config.mode === 'cloud') {
      cloudRepos = await listCursorCloudRepos(config.apiKey)
    }
  }

  return {
    hasApiKey,
    ready: isCursorReadyForBuild(config),
    mode: config.mode,
    accountEmail: config.accountEmail,
    accountName: config.accountName,
    repo: config.repo,
    localProjects: config.localProjects,
    activeLocalProjectId: config.activeLocalProjectId,
    cloudRepos
  }
}

export function createCursorLocalProjectDir(
  name: string,
  parent?: string
): { path: string; name: string } | null {
  const base = parent?.trim() || join(homedir(), 'Projects')
  const slug = name.trim().replace(/[^\w.-]+/g, '-')
  if (!slug) return null
  const path = join(base, slug)
  mkdirSync(path, { recursive: true })
  return { path, name: slug }
}

export function upsertCursorLocalProject(project: {
  path: string
  name?: string
}): CursorLocalProject {
  const config = getCursorBuildConfig()
  const path = project.path.trim()
  const existing = config.localProjects.find((p) => p.path === path)
  if (existing) {
    connectWithToken('cursor', {
      ...getIntegrationToken('cursor'),
      activeLocalProjectId: existing.id
    })
    return existing
  }

  const entry: CursorLocalProject = {
    id: randomUUID(),
    name: project.name?.trim() || path.split('/').filter(Boolean).pop() || 'project',
    path,
    addedAt: new Date().toISOString()
  }

  const localProjects = [entry, ...config.localProjects]
  connectWithToken('cursor', {
    ...getIntegrationToken('cursor'),
    localProjects,
    activeLocalProjectId: entry.id,
    mode: 'local'
  })
  return entry
}

export function removeCursorLocalProject(id: string): boolean {
  const config = getCursorBuildConfig()
  const next = config.localProjects.filter((p) => p.id !== id)
  if (next.length === config.localProjects.length) return false
  const activeLocalProjectId =
    config.activeLocalProjectId === id ? next[0]?.id : config.activeLocalProjectId
  connectWithToken('cursor', {
    ...getIntegrationToken('cursor'),
    localProjects: next,
    activeLocalProjectId
  })
  return true
}

export function setCursorBuildMode(mode: CursorBuildMode): void {
  connectWithToken('cursor', { ...getIntegrationToken('cursor'), mode })
}

export function setCursorActiveProject(id: string): boolean {
  const config = getCursorBuildConfig()
  if (!config.localProjects.some((p) => p.id === id)) return false
  connectWithToken('cursor', {
    ...getIntegrationToken('cursor'),
    activeLocalProjectId: id,
    mode: 'local'
  })
  return true
}

export function setCursorCloudRepo(repo: string): void {
  connectWithToken('cursor', {
    ...getIntegrationToken('cursor'),
    repo: repo.trim(),
    mode: 'cloud'
  })
}

async function launchCloudCursorAgent(prompt: string): Promise<{ id?: string; status?: string } | null> {
  const key = apiKey('cursor')
  if (!key) return null
  const repo = String(getIntegrationToken('cursor')?.repo ?? process.env.CURSOR_DEFAULT_REPO ?? '')
  if (!repo) return null

  try {
    const res = await fetch(AGENTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        source: { repository: repo }
      })
    })
    if (!res.ok) return null
    return (await res.json()) as { id?: string; status?: string }
  } catch {
    return null
  }
}

export async function askCursor(
  query: string,
  systemPrompt: string,
  io?: SocketServer,
  opts?: { forceLocal?: boolean; resumeAgentId?: string }
): Promise<StreamItem> {
  if (!isCursorConnected()) throw new Error('Cursor not connected')

  const config = getCursorBuildConfig()
  const fullPrompt = `${systemPrompt}\n\n${query}`
  const useLocal = opts?.forceLocal || config.mode === 'local'
  const localProject = getActiveLocalProject(config)

  if (useLocal && localProject && config.apiKey) {
    const startedAt = new Date().toISOString()
    const item = normalizeAiAssist({
      source: 'cursor',
      query,
      answer: 'Starting local Cursor agent…',
      senderName: 'Cursor',
      handle: 'cursor',
      metadata: {
        agentStatus: 'running',
        startedAt,
        runtime: 'local',
        projectPath: localProject.path,
        projectName: localProject.name
      }
    })
    upsertItem(item)
    io?.emit('stream:item', item)

    const agent = await launchLocalCursorAgent({
      apiKey: config.apiKey,
      cwd: localProject.path,
      prompt: fullPrompt,
      agentId: opts?.resumeAgentId,
      streamItemId: item.id,
      io
    })
    const launchError =
      agent && 'error' in agent ? String(agent.error) : undefined
    const answer = agent && 'agentId' in agent
      ? `Cursor local agent started (${agent.agentId}) in ${localProject.name}. Watch live output in Cursor.`
      : launchError ??
        `Could not start local Cursor agent in ${localProject.path}. Is Cursor installed?`

    const updated = {
      ...item,
      body: answer.slice(0, 500),
      bodyFull: answer,
      metadata: {
        ...item.metadata,
        agentId: agent && 'agentId' in agent ? agent.agentId : undefined,
        runId: agent && 'agentId' in agent ? agent.runId : undefined,
        agentStatus:
          agent && 'agentId' in agent ? (agent.status ?? 'running') : 'error'
      }
    }
    upsertItem(updated)
    io?.emit('stream:item', updated)
    return updated
  }

  const cloud = await launchCloudCursorAgent(fullPrompt)
  const answer = cloud?.id
    ? `Cursor cloud agent started (${cloud.id}). Track progress in Cursor Cloud.`
    : config.mode === 'cloud'
      ? 'Cursor cloud agent failed. Check API key and repo in Apps → Cursor.'
      : 'Add a local project in Build, or set a cloud repo in Apps → Cursor.'

  const item = normalizeAiAssist({
    source: 'cursor',
    query,
    answer,
    senderName: 'Cursor',
    handle: 'cursor',
    metadata: {
      agentId: cloud?.id,
      agentStatus: cloud?.status ?? 'queued',
      startedAt: new Date().toISOString(),
      runtime: 'cloud',
      repo: config.repo
    }
  })
  upsertItem(item)
  io?.emit('stream:item', item)
  return item
}

export async function listCursorProjectAgents(projectId: string): Promise<
  Array<{ agentId: string; name: string; status?: string; summary?: string }>
> {
  const config = getCursorBuildConfig()
  const project = config.localProjects.find((p) => p.id === projectId)
  if (!project || !config.apiKey) return []
  return listLocalAgentsForProject(config.apiKey, project.path)
}

const TERMINAL_BUILD_STATUS = new Set([
  'finished',
  'error',
  'success',
  'failed',
  'completed',
  'cancelled',
  'done',
  'stale',
  'unknown'
])

export async function reconcileCursorBuilds(io?: SocketServer): Promise<{ updated: number }> {
  const config = getCursorBuildConfig()
  if (!config.apiKey) return { updated: 0 }

  const items = getRecentItems(80, 'cursor').filter((item) => {
    const status = String(item.metadata?.agentStatus ?? '').toLowerCase()
    return (
      !TERMINAL_BUILD_STATUS.has(status) &&
      item.metadata?.agentId &&
      item.metadata?.runtime === 'local' &&
      item.metadata?.projectPath
    )
  })

  let updated = 0
  for (const item of items) {
    const path = String(item.metadata?.projectPath)
    const agentId = String(item.metadata?.agentId)
    const agents = await listLocalAgentsForProject(config.apiKey, path)
    const hit = agents.find((a) => a.agentId === agentId)

    if (!hit) {
      const startedRaw = item.metadata?.startedAt ?? item.timestamp.toISOString()
      const startedMs = new Date(String(startedRaw)).getTime()
      if (Number.isFinite(startedMs) && Date.now() - startedMs > 30 * 60 * 1000) {
        const patched = {
          ...item,
          metadata: {
            ...item.metadata,
            agentStatus: 'stale',
            currentStep:
              'No live updates from Cursor. Open the project in Cursor or start a new build.'
          }
        }
        upsertItem(patched)
        io?.emit('stream:item', patched)
        updated++
      }
      continue
    }

    if (hit.status === 'finished' || hit.status === 'error') {
      const startedRaw = item.metadata?.startedAt ?? item.timestamp.toISOString()
      const startedMs = new Date(String(startedRaw)).getTime()
      const completedAt = new Date().toISOString()
      const durationMs = Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : undefined
      const patched = {
        ...item,
        body: hit.status === 'error' ? 'Cursor agent failed.' : 'Cursor agent finished.',
        bodyFull: hit.summary || item.bodyFull,
        metadata: {
          ...item.metadata,
          agentStatus: hit.status,
          currentStep: hit.summary || item.metadata?.currentStep,
          completedAt,
          ...(durationMs != null ? { durationMs } : {})
        }
      }
      upsertItem(patched)
      io?.emit('stream:item', patched)
      updated++
    } else if (hit.summary && hit.summary !== item.metadata?.currentStep) {
      const patched = {
        ...item,
        metadata: {
          ...item.metadata,
          currentStep: hit.summary,
          agentStatus: hit.status ?? 'running'
        }
      }
      upsertItem(patched)
      io?.emit('stream:item', patched)
      updated++
    }
  }

  for (const item of getRecentItems(80, 'cursor')) {
    const status = String(item.metadata?.agentStatus ?? '').toLowerCase()
    if (TERMINAL_BUILD_STATUS.has(status)) continue
    const startedRaw = item.metadata?.startedAt ?? item.timestamp.toISOString()
    const startedMs = new Date(String(startedRaw)).getTime()
    if (!Number.isFinite(startedMs) || Date.now() - startedMs <= 30 * 60 * 1000) continue

    const patched = {
      ...item,
      metadata: {
        ...item.metadata,
        agentStatus: 'stale',
        currentStep: 'Build timed out — not running. Start a new build from the Build page.'
      }
    }
    upsertItem(patched)
    io?.emit('stream:item', patched)
    updated++
  }

  return { updated }
}

export async function syncCursor(_io?: SocketServer): Promise<StreamItem[]> {
  return []
}
