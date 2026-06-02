import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { CustomMcpAgent } from '../../shared/fde-engagement'

function agentsPath(): string {
  const dir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'mcp-agents.json')
}

function readAll(): CustomMcpAgent[] {
  const path = agentsPath()
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as CustomMcpAgent[]
  } catch {
    return []
  }
}

function writeAll(agents: CustomMcpAgent[]): CustomMcpAgent[] {
  writeFileSync(agentsPath(), JSON.stringify(agents, null, 2), 'utf8')
  return agents
}

export function listMcpAgents(): CustomMcpAgent[] {
  return readAll().sort((a, b) => b.createdAt - a.createdAt)
}

export function saveMcpAgent(
  input: Omit<CustomMcpAgent, 'id' | 'createdAt'> & { id?: string }
): CustomMcpAgent {
  const agents = readAll()
  const id = input.id ?? `mcp-${randomUUID()}`
  const agent: CustomMcpAgent = {
    id,
    name: input.name.trim(),
    description: input.description?.trim(),
    transport: input.transport,
    command: input.command?.trim(),
    args: input.args,
    url: input.url?.trim(),
    composeAlias: input.composeAlias?.trim().replace(/^@/, ''),
    enabled: input.enabled !== false,
    createdAt: agents.find((a) => a.id === id)?.createdAt ?? Date.now()
  }
  const next = agents.filter((a) => a.id !== id)
  next.unshift(agent)
  writeAll(next)
  return agent
}

export function deleteMcpAgent(id: string): boolean {
  const agents = readAll()
  const next = agents.filter((a) => a.id !== id)
  if (next.length === agents.length) return false
  writeAll(next)
  return true
}
