import { spawn, execSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import type { Server as SocketServer } from 'socket.io'
import { getRecentItems, upsertItem } from '../db'
import { detectLocalClaudeAccount } from './claudeOAuth'
import type { ClaudeCodeBuildStatus } from '../../shared/build-executor'

const activeRuns = new Map<string, { child: ReturnType<typeof spawn> }>()

function claudeCliCandidates(): string[] {
  const home = homedir()
  const nodeBin = dirname(process.execPath)
  const nvmDir = process.env.NVM_DIR ?? join(home, '.nvm')
  return [
    join(nodeBin, 'claude'),
    process.env.CLAUDE_CLI_PATH,
    join(home, '.local', 'bin', 'claude'),
    join(home, '.npm-global', 'bin', 'claude'),
    join(nvmDir, 'versions', 'node', process.version, 'bin', 'claude')
  ].filter((p): p is string => Boolean(p))
}

function findClaudeCli(): string | null {
  for (const candidate of claudeCliCandidates()) {
    if (existsSync(candidate)) return candidate
  }

  const home = homedir()
  const nvmDir = process.env.NVM_DIR ?? join(home, '.nvm')
  const augmentedPath = [
    dirname(process.execPath),
    process.env.NVM_BIN,
    join(home, '.local', 'bin'),
    join(nvmDir, 'versions', 'node', process.version, 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.PATH
  ]
    .filter(Boolean)
    .join(':')

  try {
    const path = execSync('which claude', {
      encoding: 'utf-8',
      timeout: 3000,
      env: { ...process.env, PATH: augmentedPath }
    }).trim()
    if (path && existsSync(path)) return path
  } catch {
    /* fall through */
  }

  return null
}

export function getClaudeCodeBuildStatus(): ClaudeCodeBuildStatus {
  const cliPath = findClaudeCli()
  const account = detectLocalClaudeAccount()
  return {
    ready: Boolean(cliPath && account),
    cliPath: cliPath ?? undefined,
    accountLabel: account?.label
  }
}

type BuildLogLine = { ts: number; text: string }

function readBuildLog(meta: Record<string, unknown> | undefined): BuildLogLine[] {
  const raw = meta?.buildLog
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      const r = row as { ts?: number; text?: string }
      if (!r.text) return null
      return { ts: Number(r.ts ?? Date.now()), text: String(r.text) }
    })
    .filter((r): r is BuildLogLine => r != null)
}

const BUILD_LOG_LINE_MAX = 8000
const BUILD_LOG_MAX_LINES = 200

function extractDeployUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/(?:[a-z0-9-]+\.)*vercel\.app[^\s)"'<>]*/i)
  return match?.[0]
}

function shouldAutoDeploy(prompt: string): boolean {
  return /\b(deploy|vercel|push to (prod|production))\b/i.test(prompt)
}

function deployToVercel(
  cwd: string,
  streamItemId: string,
  io?: SocketServer
): Promise<void> {
  if (!existsSync(join(cwd, '.vercel', 'project.json'))) {
    publishStep(streamItemId, 'No linked Vercel project — run vercel link in the repo.', io)
    return Promise.resolve()
  }

  publishStep(streamItemId, 'Deploying to Vercel production…', io)

  return new Promise((resolve) => {
    const child = spawn('vercel', ['--prod', '--yes'], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.on('error', (err) => {
      publishStep(streamItemId, `Vercel deploy failed: ${err.message}`, io)
      resolve()
    })
    child.on('close', (deployCode) => {
      const url = extractDeployUrl(out)
      if (deployCode === 0) {
        publishStep(
          streamItemId,
          url ? `Deployed to ${url}` : 'Deployed to Vercel production.',
          io
        )
      } else {
        const tail = out.trim().split('\n').slice(-3).join(' ').slice(0, 400)
        publishStep(
          streamItemId,
          tail ? `Vercel deploy failed: ${tail}` : `Vercel deploy failed (exit ${deployCode ?? '?'})`,
          io
        )
      }
      resolve()
    })
  })
}

function publishStep(streamItemId: string, step: string, io?: SocketServer): void {
  const existing = getRecentItems(80, 'claude').find((item) => item.id === streamItemId)
  if (!existing) return
  const trimmedStep = step.trim().slice(0, BUILD_LOG_LINE_MAX)
  if (!trimmedStep) return
  const log = readBuildLog(existing.metadata as Record<string, unknown>)
  const last = log[log.length - 1]?.text
  if (last !== trimmedStep) log.push({ ts: Date.now(), text: trimmedStep })
  const buildLog = log.slice(-BUILD_LOG_MAX_LINES)
  const deployUrl = extractDeployUrl(trimmedStep) ?? extractDeployUrl(buildLog.map((l) => l.text).join('\n'))
  const updated = {
    ...existing,
    metadata: {
      ...existing.metadata,
      currentStep: trimmedStep.slice(0, 500),
      buildLog,
      agentStatus: 'running',
      ...(deployUrl ? { deployUrl } : {})
    }
  }
  upsertItem(updated)
  io?.emit('stream:item', updated)
  io?.emit('build:log', { itemId: streamItemId, text: trimmedStep, ts: Date.now() })
}

function finishRun(
  streamItemId: string,
  status: 'finished' | 'error',
  detail: string,
  io?: SocketServer
): void {
  const existing = getRecentItems(80, 'claude').find((item) => item.id === streamItemId)
  if (!existing) return
  const startedRaw = existing.metadata?.startedAt ?? existing.timestamp.toISOString()
  const startedMs = new Date(String(startedRaw)).getTime()
  const completedAt = new Date().toISOString()
  const durationMs = Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : undefined
  const log = readBuildLog(existing.metadata as Record<string, unknown>)
  const summary = detail.trim().slice(0, BUILD_LOG_LINE_MAX)
  if (summary && log[log.length - 1]?.text !== summary) {
    log.push({ ts: Date.now(), text: summary })
  }
  const deployUrl =
    extractDeployUrl(detail) ??
    extractDeployUrl(log.map((l) => l.text).join('\n')) ??
    (existing.metadata?.deployUrl ? String(existing.metadata.deployUrl) : undefined)

  const updated = {
    ...existing,
    body: detail.slice(0, 500),
    bodyFull: detail,
    metadata: {
      ...existing.metadata,
      agentStatus: status,
      completedAt,
      buildLog: log.slice(-BUILD_LOG_MAX_LINES),
      ...(durationMs != null ? { durationMs } : {}),
      currentStep: status === 'error' ? detail.slice(0, 500) : 'Build finished',
      ...(deployUrl ? { deployUrl } : {})
    }
  }
  upsertItem(updated)
  io?.emit('stream:item', updated)
}

function stepFromStreamJson(line: string): string | null {
  try {
    const evt = JSON.parse(line) as Record<string, unknown>
    const type = String(evt.type ?? '')
    if (type === 'assistant' && evt.message) {
      const msg = evt.message as { content?: Array<{ type?: string; text?: string }> }
      const text = (msg.content ?? [])
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!)
        .join(' ')
        .trim()
      return text ? text.slice(0, BUILD_LOG_LINE_MAX) : null
    }
    if (type === 'tool_use' || type === 'tool_call' || type === 'tool_progress') {
      const name = String(evt.name ?? evt.tool_name ?? evt.tool ?? 'tool')
      return `Using ${name}…`
    }
    if (type === 'content_block_delta' || type === 'message_delta') {
      const delta = evt.delta as { text?: string } | undefined
      const text = String(delta?.text ?? '').trim()
      return text ? text.slice(0, BUILD_LOG_LINE_MAX) : null
    }
    if (type === 'result' && evt.result) {
      return String(evt.result).slice(0, BUILD_LOG_LINE_MAX)
    }
    if (evt.subtype === 'init') return 'Claude Code started…'
  } catch {
    /* ignore partial lines */
  }
  return null
}

export async function launchClaudeCodeBuild(input: {
  cwd: string
  prompt: string
  streamItemId: string
  io?: SocketServer
}): Promise<{ ok: boolean; error?: string }> {
  const cliPath = findClaudeCli()
  if (!cliPath) {
    return { ok: false, error: 'Claude Code CLI not found — run: npm i -g @anthropic-ai/claude-code && claude login' }
  }
  if (!detectLocalClaudeAccount()) {
    return { ok: false, error: 'Claude Code not signed in — run claude login in Terminal' }
  }
  if (!existsSync(input.cwd)) {
    return { ok: false, error: `Project folder not found: ${input.cwd}` }
  }

  const args = [
    '-p',
    '--permission-mode',
    'acceptEdits',
    '--allowed-tools',
    'Bash(vercel *),Bash(npm *),Bash(npx *),Bash(node *),Bash(which *),Read,Edit,Write,Glob,Grep',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages'
  ]

  try {
    const child = spawn(cliPath, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    activeRuns.set(input.streamItemId, { child })

    child.stdin.write(input.prompt)
    child.stdin.end()

    let stderr = ''
    let stdoutBuf = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const step = stepFromStreamJson(trimmed)
        if (step) publishStep(input.streamItemId, step, input.io)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err) => {
      activeRuns.delete(input.streamItemId)
      finishRun(input.streamItemId, 'error', err.message, input.io)
    })

    child.on('close', (code) => {
      activeRuns.delete(input.streamItemId)
      void (async () => {
        if (code === 0) {
          if (shouldAutoDeploy(input.prompt)) {
            await deployToVercel(input.cwd, input.streamItemId, input.io)
          }
          finishRun(input.streamItemId, 'finished', 'Claude Code build finished.', input.io)
          return
        }
        const reason = stderr.trim() || `Claude Code exited with code ${code ?? 'unknown'}`
        finishRun(input.streamItemId, 'error', reason, input.io)
      })()
    })

    publishStep(input.streamItemId, 'Claude Code started…', input.io)
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export function cancelClaudeCodeBuild(streamItemId: string): boolean {
  const hit = activeRuns.get(streamItemId)
  if (!hit) return false
  hit.child.kill('SIGTERM')
  activeRuns.delete(streamItemId)
  return true
}

export function cancelAllClaudeCodeBuilds(): string[] {
  const ids: string[] = []
  for (const [streamItemId, hit] of activeRuns) {
    try {
      hit.child.kill('SIGTERM')
    } catch {
      /* process may have exited */
    }
    ids.push(streamItemId)
  }
  activeRuns.clear()
  return ids
}

export function markBuildCancelled(streamItemId: string, io?: SocketServer): void {
  const sources = ['claude', 'cursor'] as const
  for (const source of sources) {
    const existing = getRecentItems(80, source).find((item) => item.id === streamItemId)
    if (!existing) continue
    const updated = {
      ...existing,
      body: 'Build stopped.',
      bodyFull: 'Build stopped by user.',
      metadata: {
        ...existing.metadata,
        agentStatus: 'cancelled',
        currentStep: 'Stopped',
        completedAt: new Date().toISOString()
      }
    }
    upsertItem(updated)
    io?.emit('stream:item', updated)
    return
  }
}
