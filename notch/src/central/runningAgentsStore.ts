import { useMemo, useSyncExternalStore } from 'react'
import type { RunningAgent } from './homeAgents'

export type RunningAgentEntry = {
  id: string
  title: string
  status: string
  startedAt: number
  meetingId?: string
  cancelled?: boolean
}

export type AgentEventDetail = {
  id: string
  title?: string
  status?: string
  meetingId?: string
}

type Snapshot = {
  agents: RunningAgentEntry[]
  panelDismissed: boolean
}

const listeners = new Set<() => void>()
const abortControllers = new Map<string, AbortController>()

let agents: RunningAgentEntry[] = []
let panelDismissed = false

function emit() {
  listeners.forEach((l) => l())
}

function getSnapshot(): Snapshot {
  return {
    agents: agents.filter((a) => !a.cancelled),
    panelDismissed
  }
}

export function subscribeRunningAgents(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getRunningAgentsSnapshot(): Snapshot {
  return getSnapshot()
}

function newAgentId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function dispatchEvent(name: string, detail: AgentEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name, { detail }))
}

function internalAdd(
  entry: RunningAgentEntry,
  opts?: { signal?: AbortSignal; dispatch?: boolean }
) {
  agents = [...agents.filter((a) => a.id !== entry.id), entry]
  panelDismissed = false

  if (opts?.signal) {
    const controller = new AbortController()
    abortControllers.set(entry.id, controller)
    const onAbort = () => {
      stopAgent(entry.id)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    opts.signal.addEventListener('abort', onAbort)
    if (opts.signal.aborted) onAbort()
  }

  emit()
  if (opts?.dispatch !== false) {
    dispatchEvent('notch:agent-started', {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      meetingId: entry.meetingId
    })
  }
}

export function startAgent(input: {
  id?: string
  title: string
  status?: string
  meetingId?: string
  signal?: AbortSignal
}): string {
  const id = input.id ?? newAgentId()
  internalAdd(
    {
      id,
      title: input.title,
      status: input.status ?? 'Running',
      startedAt: Date.now(),
      meetingId: input.meetingId
    },
    { signal: input.signal }
  )
  return id
}

export function updateAgentStatus(id: string, status: string, opts?: { dispatch?: boolean }) {
  const idx = agents.findIndex((a) => a.id === id)
  if (idx < 0 || agents[idx].cancelled) return
  agents = agents.map((a) => (a.id === id ? { ...a, status } : a))
  emit()
  if (opts?.dispatch !== false) {
    dispatchEvent('notch:agent-updated', { id, status })
  }
}

export function completeAgent(id: string, opts?: { dispatch?: boolean }) {
  abortControllers.delete(id)
  agents = agents.filter((a) => a.id !== id)
  emit()
  if (opts?.dispatch !== false) {
    dispatchEvent('notch:agent-completed', { id })
  }
}

export function stopAgent(id: string) {
  const controller = abortControllers.get(id)
  if (controller) {
    controller.abort()
    abortControllers.delete(id)
  }
  agents = agents.map((a) =>
    a.id === id ? { ...a, status: 'Cancelled', cancelled: true } : a
  )
  agents = agents.filter((a) => !a.cancelled)
  emit()
  dispatchEvent('notch:agent-completed', { id })
}

export function stopAll() {
  for (const controller of abortControllers.values()) {
    controller.abort()
  }
  abortControllers.clear()
  agents = []
  emit()
}

export function dismissRunningAgentsPanel() {
  panelDismissed = true
  emit()
}

export function showRunningAgentsPanel() {
  panelDismissed = false
  emit()
}

export function createAgentAbortSignal(agentId: string): AbortSignal {
  let controller = abortControllers.get(agentId)
  if (!controller) {
    controller = new AbortController()
    abortControllers.set(agentId, controller)
  }
  return controller.signal
}

export type PanelAgent = {
  id: string
  title: string
  status: string
  meetingId?: string
}

export function mergeRunningAgents(
  storeAgents: RunningAgentEntry[],
  streamAgents: RunningAgent[]
): PanelAgent[] {
  const byId = new Map<string, PanelAgent>()

  for (const agent of streamAgents) {
    byId.set(agent.id, {
      id: agent.id,
      title: agent.title,
      status: agent.status ?? 'Running',
      meetingId: agent.meetingId
    })
  }

  for (const agent of storeAgents) {
    byId.set(agent.id, {
      id: agent.id,
      title: agent.title,
      status: agent.status,
      meetingId: agent.meetingId
    })
  }

  return Array.from(byId.values())
}

export function useRunningAgentsPanel() {
  const snapshot = useSyncExternalStore(subscribeRunningAgents, getRunningAgentsSnapshot, getRunningAgentsSnapshot)
  return snapshot
}

export function useMergedRunningAgents(streamAgents: RunningAgent[]) {
  const { agents: storeAgents } = useRunningAgentsPanel()
  return useMemo(() => mergeRunningAgents(storeAgents, streamAgents), [storeAgents, streamAgents])
}

function bindExternalAgentEvents() {
  if (typeof window === 'undefined') return

  window.addEventListener('notch:agent-started', (e) => {
    const detail = (e as CustomEvent<AgentEventDetail>).detail
    if (!detail?.id || !detail.title) return
    if (agents.some((a) => a.id === detail.id)) return
    internalAdd(
      {
        id: detail.id,
        title: detail.title,
        status: detail.status ?? 'Running',
        startedAt: Date.now(),
        meetingId: detail.meetingId
      },
      { dispatch: false }
    )
  })

  window.addEventListener('notch:agent-updated', (e) => {
    const detail = (e as CustomEvent<AgentEventDetail>).detail
    if (!detail?.id || !detail.status) return
    updateAgentStatus(detail.id, detail.status, { dispatch: false })
  })

  window.addEventListener('notch:agent-completed', (e) => {
    const detail = (e as CustomEvent<AgentEventDetail>).detail
    if (!detail?.id) return
    completeAgent(detail.id, { dispatch: false })
  })
}

bindExternalAgentEvents()
