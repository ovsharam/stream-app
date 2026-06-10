import { spawn } from 'child_process'
import { existsSync } from 'fs'
import type { Server as SocketServer } from 'socket.io'
import { getRecentItems, upsertItem } from '../db'

type LaunchResult = { agentId: string; status: string; runId?: string }
type LaunchFailure = { error: string }

function launchError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = String((err as { message?: string }).message ?? '').trim()
    if (message) return message
  }
  return err instanceof Error ? err.message : String(err)
}

/** Local SDK agents need the Cursor desktop app attached to the project folder. */
async function ensureCursorAppOpen(cwd: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn('open', ['-a', 'Cursor', cwd], { stdio: 'ignore' })
    const done = () => setTimeout(resolve, 1400)
    child.once('exit', done)
    child.once('error', done)
  })
}

async function loadSdk() {
  return import('@cursor/sdk')
}

export async function verifyCursorAccount(apiKey: string): Promise<{
  email?: string
  name?: string
} | null> {
  try {
    const { Cursor } = await loadSdk()
    const user = await Cursor.me({ apiKey })
    const name =
      [user.userFirstName, user.userLastName].filter(Boolean).join(' ') ||
      user.apiKeyName
    return { email: user.userEmail, name }
  } catch {
    return null
  }
}

export async function listCursorCloudRepos(
  apiKey: string
): Promise<Array<{ url: string; name: string }>> {
  try {
    const { Cursor } = await loadSdk()
    const result = await Cursor.repositories.list({ apiKey })
    return (result ?? [])
      .map((r) => {
        const url = r.url ?? ''
        const parts = url.replace(/^https?:\/\/github\.com\//, '').split('/')
        const name = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : url || 'repo'
        return { url, name }
      })
      .filter((r) => r.url)
  } catch {
    return []
  }
}

export async function listLocalAgentsForProject(
  _apiKey: string,
  cwd: string
): Promise<Array<{ agentId: string; name: string; status?: string; summary?: string }>> {
  try {
    const { Agent } = await loadSdk()
    const result = await Agent.list({ runtime: 'local', cwd, limit: 20 })
    return result.items.map((a) => ({
      agentId: a.agentId,
      name: a.name,
      status: a.status,
      summary: a.summary
    }))
  } catch {
    return []
  }
}

function stepFromSdkMessage(msg: { type: string; [key: string]: unknown }): string | null {
  switch (msg.type) {
    case 'tool_call': {
      const name = String(msg.name ?? 'tool')
      const status = String(msg.status ?? 'running')
      if (status === 'running') return `Using ${name}…`
      if (status === 'error') return `${name} failed`
      return `Finished ${name}`
    }
    case 'task': {
      const text = String(msg.text ?? '').trim()
      if (text) return text
      const status = String(msg.status ?? '').trim()
      return status || null
    }
    case 'status': {
      const message = String(msg.message ?? '').trim()
      if (message) return message
      const status = String(msg.status ?? '').trim()
      return status ? status.replace(/_/g, ' ').toLowerCase() : null
    }
    case 'thinking': {
      const text = String(msg.text ?? '').trim()
      return text ? `Thinking: ${text}` : 'Thinking…'
    }
    case 'assistant': {
      const message = msg.message as { content?: Array<{ type?: string; text?: string }> } | undefined
      const blocks = message?.content ?? []
      const text = blocks
        .filter((b) => b.type === 'text' && b.text)
        .map((b) => b.text!)
        .join(' ')
        .trim()
      return text ? text.slice(0, 240) : null
    }
    default:
      return null
  }
}

function publishBuildStep(streamItemId: string, step: string, io?: SocketServer): void {
  const existing = getRecentItems(80, 'cursor').find((item) => item.id === streamItemId)
  if (!existing) return
  const prev = String(existing.metadata?.currentStep ?? '')
  if (prev === step) return

  const updated = {
    ...existing,
    metadata: {
      ...existing.metadata,
      currentStep: step,
      agentStatus: 'running'
    }
  }
  upsertItem(updated)
  io?.emit('stream:item', updated)
}

function buildRunOutcomeCopy(
  agentId: string,
  result: { status: string; id?: string; result?: string }
): { body: string; step?: string } {
  const detail = result.result?.trim()
  if (result.status === 'error') {
    const reason = detail || 'Cursor returned an error — check usage limits or open the agent in Cursor.'
    return {
      body: reason.slice(0, 500),
      step: reason.slice(0, 240)
    }
  }
  if (detail) {
    return { body: detail.slice(0, 500), step: detail.slice(0, 240) }
  }
  return { body: `Local agent ${agentId} finished (${result.status}).` }
}

function trackLocalRun(
  agentId: string,
  result: { status: string; id?: string; result?: string },
  io?: SocketServer,
  streamItemId?: string
): void {
  const outcome = buildRunOutcomeCopy(agentId, result)
  if (streamItemId) {
    const existing = getRecentItems(80, 'cursor').find((item) => item.id === streamItemId)
    if (existing) {
      const startedRaw = existing.metadata?.startedAt ?? existing.timestamp.toISOString()
      const startedMs = new Date(String(startedRaw)).getTime()
      const completedAt = new Date().toISOString()
      const durationMs = Number.isFinite(startedMs) ? Math.max(0, Date.now() - startedMs) : undefined
      const updated = {
        ...existing,
        body: outcome.body,
        bodyFull: outcome.body,
        metadata: {
          ...existing.metadata,
          agentStatus: result.status,
          runId: result.id,
          startedAt: startedRaw,
          completedAt,
          ...(outcome.step ? { currentStep: outcome.step } : {}),
          ...(durationMs != null ? { durationMs } : {})
        }
      }
      upsertItem(updated)
      io?.emit('stream:item', updated)
      return
    }
  }
  io?.emit('stream:item', {
    id: `cursor-local-${agentId}-${Date.now()}`,
    source: 'cursor',
    kind: 'build_prompt',
    title: 'Cursor local build',
    body: `Local agent ${agentId} finished (${result.status}).`,
    meta: { agentId, agentStatus: result.status, runtime: 'local' }
  })
}

export async function launchLocalCursorAgent(input: {
  apiKey: string
  cwd: string
  prompt: string
  agentId?: string
  streamItemId?: string
  io?: SocketServer
}): Promise<LaunchResult | LaunchFailure | null> {
  if (!existsSync(input.cwd)) {
    return { error: `Project folder not found: ${input.cwd}` }
  }

  try {
    await ensureCursorAppOpen(input.cwd)
    const { Agent } = await loadSdk()
    const agent = input.agentId
      ? await Agent.resume(input.agentId, {
          apiKey: input.apiKey,
          local: { cwd: input.cwd }
        })
      : await Agent.create({
          apiKey: input.apiKey,
          model: { id: 'composer-2.5' },
          local: { cwd: input.cwd }
        })

    const run = await agent.send(input.prompt)
    const agentId = agent.agentId
    const runId = run.id

    void (async () => {
      try {
        for await (const msg of run.stream()) {
          const step = stepFromSdkMessage(msg as { type: string; [key: string]: unknown })
          if (step && input.streamItemId) {
            publishBuildStep(input.streamItemId, step, input.io)
          }
        }
        const result = await run.wait()
        trackLocalRun(
          agentId,
          { status: result.status, id: runId, result: result.result },
          input.io,
          input.streamItemId
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[cursor] local run failed:', err)
        trackLocalRun(
          agentId,
          {
            status: 'error',
            id: runId,
            result: message.includes('rate') || message.includes('limit')
              ? 'Cursor usage limit reached — upgrade or wait for your limit to reset.'
              : message
          },
          input.io,
          input.streamItemId
        )
      } finally {
        agent.close()
      }
    })()

    return { agentId, runId, status: 'running' }
  } catch (err) {
    const message = launchError(err)
    console.warn('[cursor] launchLocalCursorAgent:', err)
    return {
      error:
        message.includes('rate') || message.includes('limit')
          ? 'Cursor usage limit reached — upgrade or wait for your limit to reset.'
          : message || 'Could not start local Cursor agent — is Cursor installed?'
    }
  }
}
