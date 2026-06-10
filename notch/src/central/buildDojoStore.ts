import type { BuildExecutor } from '@shared/build-executor'
import type { BuildThread, BuildChatMessage } from '@shared/build-dojo'

import type { BuildPane } from './buildAgentTabs'

const THREADS_KEY = 'notch.buildDojo.threads'
const ACTIVE_KEY = 'notch.buildDojo.activeThreadId'
const VIEW_KEY = 'notch.buildDojo.view'
const EXECUTOR_KEY = 'notch.buildDojo.executor'
const PANE_KEY = 'notch.buildDojo.pane'
const AGENT_TABS_KEY = 'notch.buildDojo.agentTabs'
const ACTIVE_AGENT_TAB_KEY = 'notch.buildDojo.activeAgentTab'
const RAIL_COLLAPSED_KEY = 'notch.buildDojo.railCollapsed'

export function loadBuildThreads(): BuildThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as BuildThread[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBuildThreads(threads: BuildThread[]): void {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 40)))
}

export function loadActiveThreadId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveThreadId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function loadDojoView(): 'dashboard' | 'dojo' {
  return localStorage.getItem(VIEW_KEY) === 'dashboard' ? 'dashboard' : 'dojo'
}

export function saveDojoView(view: 'dashboard' | 'dojo'): void {
  localStorage.setItem(VIEW_KEY, view)
}

export function loadDojoExecutor(): BuildExecutor {
  const v = localStorage.getItem(EXECUTOR_KEY)
  if (v === 'cursor-local' || v === 'cursor-cloud' || v === 'claude-code') return v
  return 'claude-code'
}

export function saveDojoExecutor(executor: BuildExecutor): void {
  localStorage.setItem(EXECUTOR_KEY, executor)
}

export function loadBuildPane(): BuildPane {
  return localStorage.getItem(PANE_KEY) === 'agent' ? 'agent' : 'chat'
}

export function saveBuildPane(pane: BuildPane): void {
  localStorage.setItem(PANE_KEY, pane)
}

export function loadOpenAgentTabIds(): string[] {
  try {
    const raw = localStorage.getItem(AGENT_TABS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveOpenAgentTabIds(ids: string[]): void {
  localStorage.setItem(AGENT_TABS_KEY, JSON.stringify(ids.slice(0, 24)))
}

export function loadActiveAgentTabId(): string | null {
  return localStorage.getItem(ACTIVE_AGENT_TAB_KEY)
}

export function saveActiveAgentTabId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_AGENT_TAB_KEY, id)
  else localStorage.removeItem(ACTIVE_AGENT_TAB_KEY)
}

export function loadBuildRailCollapsed(): boolean {
  return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'
}

export function saveBuildRailCollapsed(collapsed: boolean): void {
  localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0')
}

export function threadTitle(messages: BuildChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim())
  if (!first) return 'New build'
  const t = first.content.trim().replace(/\s+/g, ' ')
  return t.length > 48 ? `${t.slice(0, 47)}…` : t
}

export function newThread(executor: BuildExecutor, projectId?: string, projectName?: string): BuildThread {
  const now = Date.now()
  return {
    id: `build-${now}-${Math.random().toString(36).slice(2, 8)}`,
    executor,
    title: 'New build',
    projectId,
    projectName,
    messages: [],
    createdAt: now,
    updatedAt: now
  }
}
