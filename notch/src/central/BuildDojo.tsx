import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { BuildAgentsStatus, BuildExecutor } from '@shared/build-executor'
import {
  BUILD_AGENTS,
  parseBuildLogLines,
  type BuildChatMessage,
  type BuildDojoView
} from '@shared/build-dojo'
import { BuildDojoDashboard } from './BuildDojoDashboard'
import { BuildDojoMessage, buildAgentMessageContent } from './BuildDojoMessage'
import { BuildWorkspaceRail } from './BuildWorkspaceRail'
import { BuildAgentPanel } from './BuildAgentPanel'
import { BuildChrome } from './BuildChrome'
import {
  type BuildPane,
  resolveBuildAgentTabs,
  runningBuildIds
} from './buildAgentTabs'
import { integrationApi } from '../lib/api'
import { useTick } from './agentDuration'
import {
  loadActiveAgentTabId,
  loadActiveThreadId,
  loadBuildPane,
  loadBuildRailCollapsed,
  loadBuildThreads,
  loadDojoExecutor,
  loadDojoView,
  loadOpenAgentTabIds,
  newThread,
  saveActiveAgentTabId,
  saveActiveThreadId,
  saveBuildPane,
  saveBuildRailCollapsed,
  saveBuildThreads,
  saveDojoExecutor,
  saveDojoView,
  saveOpenAgentTabIds,
  threadTitle
} from './buildDojoStore'

type Props = {
  events: CentralStreamEvent[]
  onOpenIntegrations?: () => void
  engagementId?: string | null
  initialPrompt?: string | null
}

function streamItemIdFromEvent(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function findStreamEvent(events: CentralStreamEvent[], streamItemId: string): CentralStreamEvent | undefined {
  return events.find(
    (e) =>
      streamItemIdFromEvent(e) === streamItemId ||
      e.id === `ext-${streamItemId}` ||
      e.id === streamItemId
  )
}

function agentStatusFromEvent(event: CentralStreamEvent | undefined): 'running' | 'done' | 'error' {
  if (!event) return 'running'
  const raw = String(event.meta?.agentStatus ?? '').toLowerCase()
  if (raw === 'error' || raw === 'failed' || raw === 'stale') return 'error'
  if (raw === 'finished' || raw === 'success' || raw === 'completed' || raw === 'done') return 'done'
  return 'running'
}

export function BuildDojo({ events, onOpenIntegrations, engagementId, initialPrompt }: Props) {
  const [view, setView] = useState<BuildDojoView>(() => loadDojoView())
  const [buildPane, setBuildPane] = useState<BuildPane>(() => loadBuildPane())
  const [executor, setExecutor] = useState<BuildExecutor>(() => loadDojoExecutor())
  const [threads, setThreads] = useState(() => loadBuildThreads())
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => loadActiveThreadId())
  const [openAgentTabIds, setOpenAgentTabIds] = useState<string[]>(() => loadOpenAgentTabIds())
  const [activeAgentTabId, setActiveAgentTabId] = useState<string | null>(() => loadActiveAgentTabId())
  const [railCollapsed, setRailCollapsed] = useState(() => loadBuildRailCollapsed())
  const [buildStatus, setBuildStatus] = useState<BuildAgentsStatus | null>(null)
  const [input, setInput] = useState(initialPrompt ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const now = useTick(1000)

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null
  const projects = buildStatus?.localProjects ?? []
  const activeProject = projects.find((p) => p.id === buildStatus?.activeLocalProjectId) ?? projects[0]
  const agentDef = BUILD_AGENTS.find((a) => a.id === executor) ?? BUILD_AGENTS[0]
  const agentTabs = useMemo(
    () => resolveBuildAgentTabs(events, openAgentTabIds),
    [events, openAgentTabIds]
  )
  const activeAgentEvent = activeAgentTabId
    ? findStreamEvent(events, activeAgentTabId)
    : undefined

  const refreshStatus = useCallback(async () => {
    try {
      setBuildStatus(await integrationApi.buildAgentsStatus())
    } catch {
      setBuildStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (initialPrompt) setInput(initialPrompt)
  }, [initialPrompt, engagementId])

  useEffect(() => {
    saveBuildThreads(threads)
  }, [threads])

  useEffect(() => {
    saveActiveThreadId(activeThreadId)
  }, [activeThreadId])

  useEffect(() => {
    saveDojoView(view)
  }, [view])

  useEffect(() => {
    saveDojoExecutor(executor)
  }, [executor])

  useEffect(() => {
    saveBuildPane(buildPane)
  }, [buildPane])

  useEffect(() => {
    saveOpenAgentTabIds(openAgentTabIds)
  }, [openAgentTabIds])

  useEffect(() => {
    saveActiveAgentTabId(activeAgentTabId)
  }, [activeAgentTabId])

  useEffect(() => {
    saveBuildRailCollapsed(railCollapsed)
  }, [railCollapsed])

  useEffect(() => {
    const fromThreads = new Set<string>()
    for (const t of threads) {
      for (const m of t.messages) {
        if (m.streamItemId) fromThreads.add(m.streamItemId)
      }
      if (t.streamItemId) fromThreads.add(t.streamItemId)
    }
    if (fromThreads.size === 0) return
    setOpenAgentTabIds((prev) => {
      const merged = new Set([...prev, ...fromThreads])
      if (merged.size === prev.length && prev.every((id) => merged.has(id))) return prev
      return [...merged]
    })
  }, [threads])

  useEffect(() => {
    const running = runningBuildIds(events)
    if (running.length === 0) return
    setOpenAgentTabIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const id of running) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? [...next] : prev
    })
  }, [events])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeThread?.messages])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [input])

  const hasRunningBuild = useMemo(
    () => threads.some((t) => t.messages.some((m) => m.status === 'running')),
    [threads]
  )

  useEffect(() => {
    if (!hasRunningBuild) return
    const t = window.setInterval(() => window.dispatchEvent(new Event('notch:stream-push')), 700)
    return () => window.clearInterval(t)
  }, [hasRunningBuild])

  useEffect(() => {
    setThreads((prev) => {
      let changed = false
      const next = prev.map((thread) => {
        const agentMsg = [...thread.messages].reverse().find((m) => m.role === 'agent' && m.streamItemId)
        if (!agentMsg?.streamItemId) return thread
        const event = findStreamEvent(events, agentMsg.streamItemId)
        if (!event) return thread

        const logLines = parseBuildLogLines(event.meta).map((l) => l.text)
        const content = buildAgentMessageContent(event, logLines)
        const status = agentStatusFromEvent(event)
        if (agentMsg.content === content && agentMsg.status === status) return thread

        changed = true
        return {
          ...thread,
          updatedAt: Date.now(),
          messages: thread.messages.map((m) =>
            m.id === agentMsg.id ? { ...m, content, status } : m
          )
        }
      })
      return changed ? next : prev
    })
  }, [events])

  const openAgentTab = (id: string) => {
    setOpenAgentTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setActiveAgentTabId(id)
    setBuildPane('agent')
    setView('dojo')
  }

  const closeAgentTab = (id: string) => {
    setOpenAgentTabIds((prev) => prev.filter((x) => x !== id))
    if (activeAgentTabId === id) {
      setActiveAgentTabId(null)
      setBuildPane('chat')
    }
  }

  const selectExecutor = (id: BuildExecutor) => {
    setExecutor(id)
    const hit = threads.find((t) => t.executor === id)
    setActiveThreadId(hit?.id ?? null)
    setBuildPane('chat')
    setView('dojo')
    setError(null)
  }

  const selectChat = (threadId?: string) => {
    setBuildPane('chat')
    setView('dojo')
    if (threadId) setActiveThreadId(threadId)
  }

  const startNewThread = () => {
    const t = newThread(executor, activeProject?.id, activeProject?.name)
    setThreads((prev) => [t, ...prev])
    setActiveThreadId(t.id)
    setBuildPane('chat')
    setView('dojo')
    setError(null)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const sendBuild = async () => {
    const text = input.trim()
    if (!text || busy) return

    let thread = activeThread
    if (!thread || thread.executor !== executor) {
      thread = newThread(executor, activeProject?.id, activeProject?.name)
      setThreads((prev) => [thread!, ...prev])
      setActiveThreadId(thread.id)
    }

    const userMsg: BuildChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      ts: Date.now()
    }
    const agentMsgId = `a-${Date.now()}`
    const agentMsg: BuildChatMessage = {
      id: agentMsgId,
      role: 'agent',
      content: 'Starting…',
      ts: Date.now(),
      status: 'running'
    }

    setThreads((prev) => {
      const others = prev.filter((t) => t.id !== thread!.id)
      const updated = {
        ...thread!,
        title: threadTitle([...thread!.messages, userMsg]),
        updatedAt: Date.now(),
        messages: [...thread!.messages, userMsg, agentMsg]
      }
      return [updated, ...others]
    })
    setInput('')
    setBusy(true)
    setError(null)
    setBuildPane('chat')
    setView('dojo')

    try {
      const result = await integrationApi.buildRun({
        executor,
        prompt: text,
        projectId: buildStatus?.activeLocalProjectId ?? activeProject?.id,
        engagementId: engagementId ?? undefined
      })
      if (!result.ok || !result.itemId) {
        setError(result.message)
        setThreads((prev) =>
          prev.map((t) =>
            t.id === thread!.id
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === agentMsgId
                      ? { ...m, content: result.message, status: 'error' as const }
                      : m
                  )
                }
              : t
          )
        )
        return
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.id === thread!.id
            ? {
                ...t,
                streamItemId: result.itemId,
                messages: t.messages.map((m) =>
                  m.id === agentMsgId
                    ? { ...m, streamItemId: result.itemId, content: `${agentDef.name} is working…` }
                    : m
                )
              }
            : t
        )
      )
      openAgentTab(result.itemId)
      window.dispatchEvent(new Event('notch:stream-push'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed')
    } finally {
      setBusy(false)
    }
  }

  const ready =
    executor === 'claude-code'
      ? Boolean(buildStatus?.claudeCode.ready && projects.length > 0)
      : executor === 'cursor-cloud'
        ? Boolean(buildStatus?.cursor.hasApiKey && buildStatus.cursor.repo)
        : Boolean(buildStatus?.cursor.hasApiKey && projects.length > 0)

  const showDashboard = view === 'dashboard'

  return (
    <div className={`x-dojo x-dojo-workspace${showDashboard ? '' : ' x-dojo-cursor'}`}>
      {showDashboard ? (
        <BuildDojoDashboard
          events={events}
          threads={threads}
          buildStatus={buildStatus}
          now={now}
          onOpenDojo={({ executor: nextExecutor, threadId, streamItemId }) => {
            if (nextExecutor) selectExecutor(nextExecutor)
            if (threadId) {
              setActiveThreadId(threadId)
              selectChat(threadId)
            } else {
              setView('dojo')
            }
            if (streamItemId) openAgentTab(streamItemId)
          }}
          onNewBuild={() => {
            startNewThread()
          }}
        />
      ) : (
        <div className="x-build-shell">
          <BuildWorkspaceRail
            buildPane={buildPane}
            executor={executor}
            threads={threads}
            activeThreadId={activeThreadId}
            agentTabs={agentTabs}
            activeAgentTabId={activeAgentTabId}
            collapsed={railCollapsed}
            onSelectExecutor={selectExecutor}
            onSelectChat={selectChat}
            onNewChat={startNewThread}
            onSelectAgentTab={openAgentTab}
            onCloseAgentTab={closeAgentTab}
            onToggleCollapsed={() => setRailCollapsed((v) => !v)}
          />
          {railCollapsed ? (
            <button
              type="button"
              className="x-workspace-rail-tab"
              aria-label="Show Build panel"
              title="Show Build panel"
              onClick={() => setRailCollapsed(false)}
            >
              ›
            </button>
          ) : null}

          <div className="x-build-main">
            <BuildChrome
              executor={executor}
              buildStatus={buildStatus}
              ready={ready}
              onProjectChange={(projectId) =>
                void integrationApi
                  .cursorSetSettings({ activeLocalProjectId: projectId, mode: 'local' })
                  .then(refreshStatus)
              }
              onOpenDashboard={() => setView('dashboard')}
              onOpenIntegrations={onOpenIntegrations}
            />
            {buildPane === 'agent' && activeAgentTabId ? (
              <BuildAgentPanel
                event={activeAgentEvent}
                streamItemId={activeAgentTabId}
                onBackToChat={() => selectChat(activeThreadId ?? undefined)}
              />
            ) : (
              <div className="x-build-chat-pane">
                <div className="x-build-chat-scroll" ref={scrollRef}>
                  {!activeThread || activeThread.messages.length === 0 ? (
                    <div className="x-build-chat-hero">
                      <p className="x-build-chat-eyebrow">{agentDef.name}</p>
                      <h1 className="x-build-chat-title">What should we build?</h1>
                      <p className="x-build-chat-lede">
                        Same agents as Cursor and Claude Code — prompt here, watch the run in a tab.
                      </p>
                      {!ready ? (
                        <p className="x-build-chat-warn">
                          Connect {agentDef.name} and pick a project folder in Setup.
                        </p>
                      ) : null}
                      <div className="x-build-chat-starters">
                        {[
                          'Fix the bug in auth and add a test',
                          'Redesign the landing page hero section',
                          'Refactor this module for clarity'
                        ].map((starter) => (
                          <button
                            key={starter}
                            type="button"
                            className="x-build-chat-starter"
                            disabled={busy || !ready}
                            onClick={() => {
                              setInput(starter)
                              inputRef.current?.focus()
                            }}
                          >
                            {starter}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="x-build-chat-thread">
                      {activeThread.messages.map((m) => {
                        return (
                          <article
                            key={m.id}
                            className={`x-build-turn x-build-turn-${m.role}${m.status === 'running' ? ' x-build-turn-running' : ''}`}
                          >
                            <div className="x-build-turn-avatar" aria-hidden>
                              {m.role === 'user' ? 'A' : agentDef.short}
                            </div>
                            <div className="x-build-turn-body">
                              <div className="x-build-turn-meta">
                                <span>{m.role === 'user' ? 'You' : agentDef.name}</span>
                                {m.status === 'done' ? <span className="x-dojo-msg-done">done</span> : null}
                                {m.status === 'error' ? <span className="x-dojo-msg-err">failed</span> : null}
                              </div>
                              {m.role === 'user' ? (
                                <p className="x-build-turn-text">{m.content}</p>
                              ) : m.streamItemId ? (
                                <button
                                  type="button"
                                  className={`x-build-run-card x-build-run-card-${m.status ?? 'done'}`}
                                  onClick={() => openAgentTab(m.streamItemId!)}
                                >
                                  <span className="x-build-run-card-status">
                                    {m.status === 'running'
                                      ? 'Running'
                                      : m.status === 'error'
                                        ? 'Failed'
                                        : 'Completed'}
                                  </span>
                                  <span className="x-build-run-card-title">
                                    {activeThread.title}
                                  </span>
                                  <span className="x-build-run-card-action">View run →</span>
                                </button>
                              ) : (
                                <BuildDojoMessage role="agent" content={m.content} deployUrl={null} />
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>

                <footer className="x-build-chat-dock">
                  <div className="x-home-composer-inner">
                    <textarea
                      ref={inputRef}
                      className="x-home-composer-input"
                      rows={1}
                      placeholder={`Message ${agentDef.name}…`}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void sendBuild()
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="x-home-composer-send"
                      disabled={busy || !input.trim() || !ready}
                      onClick={() => void sendBuild()}
                      aria-label="Run build"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M12 19V5M12 5L6 11M12 5L18 11"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="x-build-chat-hint">
                    {ready
                      ? 'Enter to run · Shift+Enter for new line · Opens agent tab like Cursor'
                      : 'Setup required — connect agent and project folder'}
                  </p>
                  {error ? <p className="x-dojo-error">{error}</p> : null}
                </footer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
