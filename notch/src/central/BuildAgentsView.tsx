import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { BuildAgentsStatus, BuildExecutor } from '@shared/build-executor'
import type { CursorBuildMode } from '@shared/cursor-build'
import { integrationApi } from '../lib/api'
import { useTick } from './agentDuration'
import { BuildRunCard } from './BuildRunCard'
import { buildRunningAgents } from './homeAgents'
import { reconcileRunningAgentsWithStream } from './runningAgentsStore'

type Props = {
  events: CentralStreamEvent[]
  onOpenIntegrations?: () => void
}

const EXECUTORS: Array<{ id: BuildExecutor; label: string; hint: string }> = [
  { id: 'claude-code', label: 'Claude', hint: 'CLI · edits locally' },
  { id: 'cursor-local', label: 'Cursor', hint: 'Local SDK' },
  { id: 'cursor-cloud', label: 'Cloud', hint: 'GitHub repo' }
]

function isBuildEvent(event: CentralStreamEvent): boolean {
  return (
    event.source === 'build' ||
    event.kind === 'build_prompt' ||
    (event.source === 'cursor' && Boolean(event.meta?.agentId)) ||
    (event.source === 'claude' && event.meta?.executor === 'claude-code')
  )
}

function defaultExecutor(status: BuildAgentsStatus | null): BuildExecutor {
  if (status?.claudeCode.ready) return 'claude-code'
  if (status?.cursor.ready && status.cursor.mode === 'cloud') return 'cursor-cloud'
  return 'cursor-local'
}

function executorReady(status: BuildAgentsStatus | null, executor: BuildExecutor): boolean {
  if (!status) return false
  if (executor === 'claude-code') return status.claudeCode.ready && status.localProjects.length > 0
  if (executor === 'cursor-cloud') return status.cursor.hasApiKey && Boolean(status.cursor.repo)
  return status.cursor.hasApiKey && status.localProjects.length > 0
}

function runButtonLabel(executor: BuildExecutor, busy: boolean): string {
  if (busy) return 'Starting…'
  if (executor === 'claude-code') return 'Run build'
  if (executor === 'cursor-cloud') return 'Run on cloud'
  return 'Run in Cursor'
}

export function BuildAgentsView({ events, onOpenIntegrations }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [buildStatus, setBuildStatus] = useState<BuildAgentsStatus | null>(null)
  const [executor, setExecutor] = useState<BuildExecutor>('claude-code')
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [showManualPath, setShowManualPath] = useState(false)
  const [agentSteps, setAgentSteps] = useState<Record<string, string>>({})
  const [showHistory, setShowHistory] = useState(false)

  const isElectronShell =
    window.notchDesktop != null || /Electron/i.test(navigator.userAgent)
  const hasFolderPicker = Boolean(window.notchDesktop?.pickProjectFolder)

  const now = useTick(1000)

  const buildEvents = useMemo(
    () => events.filter(isBuildEvent).sort((a, b) => b.ts - a.ts).slice(0, 24),
    [events]
  )

  const activeBuildIds = useMemo(
    () => new Set(buildRunningAgents({ events }).map((agent) => agent.id)),
    [events]
  )

  const runningBuilds = useMemo(
    () => buildEvents.filter((event) => activeBuildIds.has(event.id)),
    [buildEvents, activeBuildIds]
  )

  const completedBuilds = useMemo(
    () => buildEvents.filter((event) => !activeBuildIds.has(event.id)).slice(0, 12),
    [buildEvents, activeBuildIds]
  )

  const refreshStatus = useCallback(async () => {
    try {
      const data = await integrationApi.buildAgentsStatus()
      setBuildStatus(data)
      setExecutor((prev) => (executorReady(data, prev) ? prev : defaultExecutor(data)))
    } catch {
      setBuildStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    reconcileRunningAgentsWithStream(events)
  }, [events])

  useEffect(() => {
    const projectId = buildStatus?.activeLocalProjectId
    if (!projectId || runningBuilds.length === 0) {
      setAgentSteps({})
      return
    }

    const poll = async () => {
      try {
        await integrationApi.cursorReconcileBuilds()
        window.dispatchEvent(new Event('notch:stream-push'))
        const { agents } = await integrationApi.cursorProjectAgents(projectId)
        const next: Record<string, string> = {}
        for (const agent of agents) {
          const step = agent.summary?.trim() || agent.name?.trim()
          if (step && agent.agentId) next[agent.agentId] = step
        }
        setAgentSteps(next)
      } catch {
        /* keep last known steps */
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 8000)
    return () => window.clearInterval(timer)
  }, [runningBuilds.length, buildStatus?.activeLocalProjectId])

  const status = buildStatus?.cursor ?? null

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const activeProject = useMemo(() => {
    const projects = buildStatus?.localProjects ?? []
    if (!projects.length) return null
    const activeId = buildStatus?.activeLocalProjectId
    if (activeId) return projects.find((p) => p.id === activeId) ?? projects[0]
    return projects[0]
  }, [buildStatus])

  const ready = executorReady(buildStatus, executor)
  const projects = buildStatus?.localProjects ?? []

  const setMode = async (mode: CursorBuildMode) => {
    try {
      await integrationApi.cursorSetSettings({ mode })
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update mode')
    }
  }

  const selectProject = async (id: string) => {
    try {
      await integrationApi.cursorSetSettings({ activeLocalProjectId: id, mode: 'local' })
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select project')
    }
  }

  const addProjectFromPicker = async () => {
    setError(null)
    if (!hasFolderPicker) {
      setShowManualPath(true)
      if (isElectronShell) {
        setError('Folder picker unavailable — restart Notch, or paste a path below.')
      }
      return
    }
    try {
      const path = await window.notchDesktop!.pickProjectFolder!()
      if (!path) return
      await integrationApi.cursorAddProject(path)
      await refreshStatus()
      setToast(`Added ${path.split('/').pop()}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open folder picker'
      setShowManualPath(true)
      setError(msg.includes('No handler registered') ? 'Restart Notch to use the folder picker.' : msg)
    }
  }

  const addProjectFromPath = async () => {
    const path = manualPath.trim()
    if (!path) return
    try {
      await integrationApi.cursorAddProject(path)
      setManualPath('')
      setShowManualPath(false)
      await refreshStatus()
      setToast(`Added ${path.split('/').pop()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add project')
    }
  }

  const createNewProject = async () => {
    const name = newProjectName.trim()
    if (!name) return
    setError(null)
    try {
      await integrationApi.cursorCreateProject(name)
      setNewProjectName('')
      setShowNewProject(false)
      await refreshStatus()
      setToast(`Created ${name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const openInCursor = async (path?: string) => {
    const target = path ?? activeProject?.path
    if (!target) {
      setError('Add a project folder first.')
      return
    }
    if (!window.notchDesktop?.openProjectInCursor) {
      setError('Restart Notch to enable Open in Cursor.')
      return
    }
    try {
      const result = await window.notchDesktop.openProjectInCursor(target)
      if (!result?.ok) setError('Could not open in Cursor.')
      else {
        setToast(`Opened ${target.split('/').pop()}`)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Open in Cursor failed')
    }
  }

  const launchAgent = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!ready) {
      if (executor === 'claude-code') {
        setError(
          buildStatus?.claudeCode.cliPath
            ? 'Run claude login, then add a project folder.'
            : 'Install Claude Code and run claude login.'
        )
      } else if (executor === 'cursor-cloud') {
        setError('Connect Cursor and set a cloud repo in Apps.')
      } else {
        setError('Connect Cursor API key and add a local project.')
      }
      return
    }

    setBusy(true)
    setError(null)

    try {
      if (executor === 'cursor-local') await openInCursor()
      const result = await integrationApi.buildRun({
        executor,
        prompt: text,
        projectId: buildStatus?.activeLocalProjectId
      })
      if (result.ok) {
        setPrompt('')
        setToast(result.message || 'Build started')
        window.dispatchEvent(new Event('notch:stream-push'))
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch build')
    } finally {
      setBusy(false)
      window.dispatchEvent(new Event('stream:user-role'))
      void refreshStatus()
    }
  }

  const connectionHint =
    executor === 'claude-code'
      ? buildStatus?.claudeCode.ready
        ? buildStatus.claudeCode.accountLabel ?? 'Claude Code ready'
        : 'Run claude login in Terminal'
      : status?.hasApiKey
        ? status.accountEmail ?? 'Cursor connected'
        : 'Connect Cursor in Apps'

  return (
    <div className="x-build-page">
      <div className="x-build-shell">
        <header className="x-build-hero">
          <div className="x-build-hero-copy">
            <p className="x-build-eyebrow">Agent builds</p>
            <h1>Ship from a prompt</h1>
            <p className="x-build-lede">
              Paste a spec. Pick a project. Claude Code or Cursor runs it locally while you stay in Notch.
            </p>
          </div>
          <div className={`x-build-ready-pill${ready ? ' x-build-ready-pill-on' : ''}`}>
            <span className="x-build-ready-dot" aria-hidden />
            {connectionHint}
          </div>
        </header>

        <div className="x-build-grid">
          <div className="x-build-main">
            <div className="x-build-compose-card">
              <div className="x-build-toolbar">
                <div className="x-build-segment" role="tablist" aria-label="Build executor">
                  {EXECUTORS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={executor === opt.id}
                      className={`x-build-segment-btn${executor === opt.id ? ' x-build-segment-btn-active' : ''}`}
                      onClick={() => {
                        setExecutor(opt.id)
                        if (opt.id === 'cursor-cloud') void setMode('cloud')
                        if (opt.id !== 'cursor-cloud') void setMode('local')
                      }}
                    >
                      <span>{opt.label}</span>
                      <small>{opt.hint}</small>
                    </button>
                  ))}
                </div>

                {executor !== 'cursor-cloud' ? (
                  <div className="x-build-project-bar">
                    <label className="x-build-project-label" htmlFor="x-build-project-select">
                      Project
                    </label>
                    <div className="x-build-project-controls">
                      <select
                        id="x-build-project-select"
                        className="x-build-project-select"
                        value={buildStatus?.activeLocalProjectId ?? ''}
                        onChange={(e) => void selectProject(e.target.value)}
                        disabled={projects.length === 0}
                      >
                        {projects.length === 0 ? (
                          <option value="">No project — add a folder</option>
                        ) : (
                          projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))
                        )}
                      </select>
                      <button type="button" className="x-build-icon-btn" onClick={() => void addProjectFromPicker()}>
                        Add folder
                      </button>
                      <button type="button" className="x-build-icon-btn" onClick={() => setShowNewProject((v) => !v)}>
                        New
                      </button>
                      {executor === 'cursor-local' && activeProject ? (
                        <button type="button" className="x-build-icon-btn" onClick={() => void openInCursor()}>
                          Open
                        </button>
                      ) : null}
                    </div>
                    {activeProject ? (
                      <p className="x-build-project-path" title={activeProject.path}>
                        {activeProject.path}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="x-build-project-bar">
                    <p className="x-build-cloud-hint">
                      {status?.repo ? `Repo: ${status.repo}` : 'Set a GitHub repo in Apps → Cursor'}
                    </p>
                  </div>
                )}

                {showNewProject ? (
                  <div className="x-build-inline-form">
                    <input
                      className="x-int-input"
                      placeholder="project-name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void createNewProject()
                      }}
                    />
                    <button type="button" className="x-int-btn" disabled={!newProjectName.trim()} onClick={() => void createNewProject()}>
                      Create
                    </button>
                  </div>
                ) : null}
                {showManualPath ? (
                  <div className="x-build-inline-form">
                    <input
                      className="x-int-input"
                      placeholder="/Users/you/Projects/my-repo"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addProjectFromPath()
                      }}
                    />
                    <button type="button" className="x-int-btn" disabled={!manualPath.trim()} onClick={() => void addProjectFromPath()}>
                      Add
                    </button>
                  </div>
                ) : null}
              </div>

              <textarea
                id="x-build-prompt"
                className="x-build-prompt-editor"
                rows={14}
                placeholder="Paste a build brief, site copy spec, or ticket…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={busy}
              />

              <div className="x-build-compose-footer">
                <div className="x-build-compose-meta">
                  {prompt.length > 0 ? <span>{prompt.length.toLocaleString()} chars</span> : <span>⌘V to paste a spec</span>}
                </div>
                <div className="x-build-compose-actions">
                  {!ready && onOpenIntegrations ? (
                    <button type="button" className="x-build-ghost-btn" onClick={onOpenIntegrations}>
                      Connect
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="x-build-primary-btn"
                    disabled={busy || !prompt.trim() || !ready}
                    onClick={() => void launchAgent()}
                  >
                    {runButtonLabel(executor, busy)}
                  </button>
                </div>
              </div>

              {error ? <p className="x-build-alert">{error}</p> : null}
              {toast ? <p className="x-build-toast">{toast}</p> : null}
            </div>
          </div>

          <aside className="x-build-side">
            <section className="x-build-side-block">
              <div className="x-build-side-head">
                <h2>Active</h2>
                {runningBuilds.length > 0 ? (
                  <span className="x-build-count">{runningBuilds.length}</span>
                ) : null}
              </div>
              {runningBuilds.length > 0 ? (
                <div className="x-build-side-list">
                  {runningBuilds.map((event) => (
                    <BuildRunCard
                      key={event.id}
                      event={event}
                      now={now}
                      variant="active"
                      stepOverride={
                        event.meta?.agentId ? agentSteps[String(event.meta.agentId)] : undefined
                      }
                      onOpenInCursor={
                        event.meta?.projectPath
                          ? () => void openInCursor(String(event.meta?.projectPath))
                          : activeProject
                            ? () => void openInCursor()
                            : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="x-build-side-empty">
                  <p>No runs in flight.</p>
                  <p className="x-build-side-empty-sub">Paste a prompt and hit Run build.</p>
                </div>
              )}
            </section>

            <section className="x-build-side-block">
              <div className="x-build-side-head">
                <h2>Recent</h2>
                {completedBuilds.length > 0 ? (
                  <button type="button" className="x-build-side-toggle" onClick={() => setShowHistory((v) => !v)}>
                    {showHistory ? 'Hide' : `Show ${completedBuilds.length}`}
                  </button>
                ) : null}
              </div>
              {completedBuilds.length === 0 ? (
                <p className="x-build-side-muted">Past builds appear here.</p>
              ) : showHistory ? (
                <div className="x-build-history">
                  {completedBuilds.map((event) => (
                    <BuildRunCard
                      key={event.id}
                      event={event}
                      now={now}
                      variant="history"
                      onOpenInCursor={
                        event.meta?.projectPath
                          ? () => void openInCursor(String(event.meta?.projectPath))
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="x-build-side-muted">
                  {completedBuilds.filter((e) => String(e.meta?.agentStatus).toLowerCase() === 'error').length} failed ·{' '}
                  {completedBuilds.length} total — expand to review
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
