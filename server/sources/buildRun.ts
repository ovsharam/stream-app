import type { Server as SocketServer } from 'socket.io'
import type { BuildExecutor, BuildAgentsStatus, BuildRunResult } from '../../shared/build-executor'
import { normalizeAiAssist } from '../normalizer'
import { upsertItem } from '../db'
import {
  askCursor,
  getActiveLocalProject,
  getCursorBuildConfig,
  getCursorBuildStatus,
  isCursorReadyForBuild
} from './cursor'
import {
  cancelAllClaudeCodeBuilds,
  cancelClaudeCodeBuild,
  getClaudeCodeBuildStatus,
  launchClaudeCodeBuild,
  markBuildCancelled
} from './claudeCodeBuild'
import { getRecentItems } from '../db'

const RUNNING_BUILD_STATUS = new Set(['running', 'queued', 'in_progress', 'pending', 'working', 'active'])

const BUILD_SYSTEM =
  'You are a senior software engineer working in the active project. Implement the request with focused code changes, verify when reasonable, and summarize what you changed.'

export async function getBuildAgentsStatus(): Promise<BuildAgentsStatus> {
  const cursor = await getCursorBuildStatus()
  const claudeCode = getClaudeCodeBuildStatus()
  return {
    claudeCode,
    cursor,
    localProjects: cursor.localProjects,
    activeLocalProjectId: cursor.activeLocalProjectId
  }
}

export async function runBuildAgent(input: {
  executor: BuildExecutor
  prompt: string
  projectId?: string
  io?: SocketServer
}): Promise<BuildRunResult> {
  const prompt = input.prompt.trim()
  if (!prompt) {
    return { ok: false, message: 'Prompt is required', executor: input.executor }
  }

  const config = getCursorBuildConfig()
  const projectId = input.projectId ?? config.activeLocalProjectId
  const localProject = projectId
    ? config.localProjects.find((p) => p.id === projectId) ?? getActiveLocalProject(config)
    : getActiveLocalProject(config)

  if (input.executor === 'claude-code') {
    const cc = getClaudeCodeBuildStatus()
    if (!cc.ready) {
      return {
        ok: false,
        message:
          cc.cliPath
            ? 'Run claude login in Terminal, then retry.'
            : 'Install Claude Code: npm i -g @anthropic-ai/claude-code && claude login',
        executor: input.executor
      }
    }
    if (!localProject?.path) {
      return { ok: false, message: 'Add a local project folder first.', executor: input.executor }
    }

    const startedAt = new Date().toISOString()
    const item = normalizeAiAssist({
      source: 'claude',
      query: prompt,
      answer: 'Starting Claude Code build…',
      senderName: 'Claude Code',
      handle: 'claude',
      metadata: {
        agentStatus: 'running',
        startedAt,
        runtime: 'local',
        executor: 'claude-code',
        projectPath: localProject.path,
        projectName: localProject.name
      }
    })
    upsertItem(item)
    input.io?.emit('stream:item', item)

    const fullPrompt = `${BUILD_SYSTEM}\n\n${prompt}`
    const launched = await launchClaudeCodeBuild({
      cwd: localProject.path,
      prompt: fullPrompt,
      streamItemId: item.id,
      io: input.io
    })

    if (!launched.ok) {
      const updated = {
        ...item,
        body: launched.error?.slice(0, 500) ?? 'Claude Code failed to start',
        metadata: { ...item.metadata, agentStatus: 'error' }
      }
      upsertItem(updated)
      input.io?.emit('stream:item', updated)
      return { ok: false, message: launched.error ?? 'Claude Code failed', executor: input.executor, itemId: item.id }
    }

    return {
      ok: true,
      message: `Claude Code building in ${localProject.name} — watch live steps in Build runs.`,
      executor: input.executor,
      itemId: item.id
    }
  }

  if (input.executor === 'cursor-cloud') {
    if (!isCursorReadyForBuild({ ...config, mode: 'cloud' })) {
      return { ok: false, message: 'Connect Cursor and set a cloud repo in Apps.', executor: input.executor }
    }
    const item = await askCursor(prompt, BUILD_SYSTEM, input.io, { forceLocal: false })
    const agentStatus = String(item.metadata?.agentStatus ?? '').toLowerCase()
    if (!item.metadata?.agentId || agentStatus === 'error') {
      return { ok: false, message: item.body, executor: input.executor, itemId: item.id }
    }
    return { ok: true, message: item.body, executor: input.executor, itemId: item.id }
  }

  // cursor-local
  if (!isCursorReadyForBuild({ ...config, mode: 'local' }) || !localProject?.path) {
    return { ok: false, message: 'Connect Cursor API key and add a local project.', executor: input.executor }
  }
  const item = await askCursor(prompt, BUILD_SYSTEM, input.io, { forceLocal: true })
  const agentStatus = String(item.metadata?.agentStatus ?? '').toLowerCase()
  if (!item.metadata?.agentId || agentStatus === 'error') {
    return { ok: false, message: item.body, executor: input.executor, itemId: item.id }
  }
  return { ok: true, message: item.body, executor: input.executor, itemId: item.id }
}

export async function cancelAllActiveBuilds(io?: SocketServer): Promise<{ cancelled: number }> {
  cancelAllClaudeCodeBuilds()

  const running = getRecentItems(120).filter((item) => {
    if (item.source !== 'claude' && item.source !== 'cursor') return false
    const status = String(item.metadata?.agentStatus ?? '').toLowerCase()
    if (!status) return item.metadata?.executor === 'claude-code'
    return RUNNING_BUILD_STATUS.has(status)
  })

  let cancelled = 0
  for (const item of running) {
    cancelClaudeCodeBuild(item.id)
    markBuildCancelled(item.id, io)
    cancelled++
  }
  return { cancelled }
}

export async function cancelBuildRun(
  streamItemId: string,
  io?: SocketServer
): Promise<{ ok: boolean }> {
  cancelClaudeCodeBuild(streamItemId)
  markBuildCancelled(streamItemId, io)
  return { ok: true }
}
