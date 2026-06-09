import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { CursorBuildMode, CursorBuildStatus } from '@shared/cursor-build'
import { clusterApi, integrationApi } from '../lib/api'
import { useTick } from './agentDuration'
import { BuildRunCard } from './BuildRunCard'
import { buildRunningAgents } from './homeAgents'
import {
  reconcileRunningAgentsWithStream
} from './runningAgentsStore'

type Props = {
  events: CentralStreamEvent[]
  onOpenIntegrations?: () => void
}

function isBuildEvent(event: CentralStreamEvent): boolean {
  return (
    event.source === 'build' ||
    event.kind === 'build_prompt' ||
    (event.source === 'cursor' && Boolean(event.meta?.agentId))
  )
}

export function BuildAgentsView({ events, onOpenIntegrations }: Props) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [status, setStatus] = useState<CursorBuildStatus | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [showManualPath, setShowManualPath] = useState(false)
  const [agentSteps, setAgentSteps] = useState<Record<string, string>>({})

  const isElectronShell =
    window.notchDesktop != null || /Electron/i.test(navigator.userAgent)
  const hasFolderPicker = Boolean(window.notchDesktop?.pickProjectFolder)

  const now = useTick(1000)

  const buildEvents = useMemo(
    () =>
      events
        .filter(isBuildEvent)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 24),
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
    () => buildEvents.filter((event) => !activeBuildIds.has(event.id)),
    [buildEvents, activeBuildIds]
  )

  const refreshStatus = useCallback(async () => {
    try {
      const data = await integrationApi.cursorBuildStatus()
      setStatus(data)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    reconcileRunningAgentsWithStream(events)
  }, [events])

  useEffect(() => {
    const projectId = status?.activeLocalProjectId
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
  }, [runningBuilds.length, status?.activeLocalProjectId])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4200)
    return () => window.clearTimeout(t)
  }, [toast])

  const activeProject = useMemo(() => {
    if (!status?.localProjects.length) return null
    if (status.activeLocalProjectId) {
      return status.localProjects.find((p) => p.id === status.activeLocalProjectId) ?? status.localProjects[0]
    }
    return status.localProjects[0]
  }, [status])

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
        setError('Folder picker unavailable — restart Notch (npm run restart:notch), or paste a path below.')
      }
      return
    }
    try {
      const path = await window.notchDesktop!.pickProjectFolder!()
      if (!path) return
      await integrationApi.cursorAddProject(path)
      await refreshStatus()
      setToast(`Added project: ${path.split('/').pop()}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to open folder picker'
      setShowManualPath(true)
      setError(
        msg.includes('No handler registered')
          ? 'Restart Notch (npm run restart:notch) to use the folder picker — or paste a path below.'
          : msg
      )
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
      setToast(`Added project: ${path.split('/').pop()}`)
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
      setError('No project folder — add a local project first.')
      return
    }
    if (!window.notchDesktop?.openProjectInCursor) {
      setError('Restart Notch (npm run restart:notch) to enable Open in Cursor.')
      return
    }
    try {
      const result = await window.notchDesktop.openProjectInCursor(target)
      if (!result?.ok) {
        setError('Could not open in Cursor — is the Cursor app installed?')
        return
      }
      setToast(`Opened ${target.split('/').pop()} in Cursor`)
      setError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Open in Cursor failed'
      setError(
        msg.includes('No handler registered')
          ? 'Restart Notch (npm run restart:notch) to enable Open in Cursor.'
          : msg
      )
    }
  }

  const launchAgent = async () => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!status?.hasApiKey) {
      setError('Connect Cursor in Apps — paste your API key from cursor.com/settings.')
      return
    }
    if (!status.ready) {
      setError(
        status.mode === 'local'
          ? 'Add or create a local project below.'
          : 'Set a GitHub repo in Apps → Cursor for cloud builds.'
      )
      return
    }

    setBusy(true)
    setError(null)
    const compose =
      status.mode === 'local' ? `@cursor local ask: ${text}` : `@cursor ask: ${text}`

    try {
      const result = await clusterApi.runAction({ text: compose })
      if (result.ok) {
        setPrompt('')
        setToast(result.message || 'Cursor agent started')
        if (status.mode === 'local') void openInCursor()
        window.dispatchEvent(new Event('notch:stream-push'))
      } else {
        setError(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch agent')
    } finally {
      setBusy(false)
      window.dispatchEvent(new Event('stream:user-role'))
      void refreshStatus()
    }
  }

  const statusLabel = !status
    ? '…'
    : !status.hasApiKey
      ? 'Not connected'
      : status.ready
        ? status.mode === 'local'
          ? `Local · ${activeProject?.name ?? 'project'}`
          : `Cloud · ${status.repo ?? 'repo'}`
        : status.accountEmail
          ? `${status.accountEmail} — setup incomplete`
          : 'Setup incomplete'

  return (
    <div className="x-build-page">
      <header className="x-build-head">
        <div>
          <h1>Build</h1>
          <p>Run Cursor agents on local projects or in the cloud.</p>
        </div>
        <span
          className={`x-build-status ${status?.ready ? 'x-build-status-on' : 'x-build-status-off'}`}
        >
          {statusLabel}
        </span>
      </header>

      <div className="x-build-layout">
        <aside className="x-build-setup">
          <section className="x-build-panel">
            <div className="x-build-mode-toggle">
              <button
                type="button"
                className={`x-int-btn x-int-btn-ghost${status?.mode === 'local' ? ' x-build-mode-active' : ''}`}
                onClick={() => void setMode('local')}
              >
                Local
              </button>
              <button
                type="button"
                className={`x-int-btn x-int-btn-ghost${status?.mode === 'cloud' ? ' x-build-mode-active' : ''}`}
                onClick={() => void setMode('cloud')}
              >
                Cloud
              </button>
            </div>
            {status?.accountEmail ? (
              <p className="x-build-account">
                Signed in as <strong>{status.accountEmail}</strong>
              </p>
            ) : null}
          </section>

          <section className="x-build-panel">
            <div className="x-build-panel-head">
              <h2>{status?.mode === 'local' ? 'Projects' : 'Cloud repo'}</h2>
              {status?.mode === 'local' ? (
                <div className="x-build-projects-actions">
                  <button type="button" className="x-int-btn x-int-btn-ghost" onClick={() => void addProjectFromPicker()}>
                    Add folder
                  </button>
                  <button
                    type="button"
                    className="x-int-btn x-int-btn-ghost"
                    onClick={() => setShowNewProject((v) => !v)}
                  >
                    New
                  </button>
                </div>
              ) : null}
            </div>

            {status?.mode === 'local' ? (
              <>
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
                    <button
                      type="button"
                      className="x-int-btn"
                      disabled={!newProjectName.trim()}
                      onClick={() => void createNewProject()}
                    >
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
                    <button
                      type="button"
                      className="x-int-btn"
                      disabled={!manualPath.trim()}
                      onClick={() => void addProjectFromPath()}
                    >
                      Add
                    </button>
                  </div>
                ) : null}
                {status.localProjects.length === 0 ? (
                  <p className="x-build-empty">Add a folder or create a new project in ~/Projects.</p>
                ) : (
                  <ul className="x-build-project-list">
                    {status.localProjects.map((project) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          className={`x-build-project-item${project.id === status.activeLocalProjectId ? ' x-build-project-active' : ''}`}
                          onClick={() => void selectProject(project.id)}
                        >
                          <strong>{project.name}</strong>
                          <span>{project.path}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {activeProject ? (
                  <button type="button" className="x-int-btn x-int-btn-ghost x-build-open-btn" onClick={() => void openInCursor()}>
                    Open {activeProject.name} in Cursor
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <p className="x-build-empty">
                  Set a default repo in <strong>Apps → Cursor</strong>
                  {status?.cloudRepos?.length ? ', or pick one:' : '.'}
                </p>
                {status?.cloudRepos?.length ? (
                  <ul className="x-build-project-list">
                    {status.cloudRepos.slice(0, 6).map((repo) => (
                      <li key={repo.url}>
                        <button
                          type="button"
                          className={`x-build-project-item${status.repo === repo.url ? ' x-build-project-active' : ''}`}
                          onClick={() =>
                            void integrationApi.cursorSetSettings({ repo: repo.url, mode: 'cloud' }).then(refreshStatus)
                          }
                        >
                          <strong>{repo.name}</strong>
                          <span>{repo.url}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </section>

          <section className="x-build-panel x-build-compose">
            <label className="x-build-compose-label" htmlFor="x-build-prompt">
              What should Cursor build?
            </label>
            <textarea
              id="x-build-prompt"
              className="x-build-prompt"
              rows={4}
              placeholder={
                status?.mode === 'local'
                  ? 'e.g. Scaffold a landing page for Notch by Applied Scope…'
                  : 'e.g. Add OAuth to the dashboard…'
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
            <div className="x-build-compose-actions">
              <button type="button" className="x-int-btn" disabled={busy || !prompt.trim()} onClick={() => void launchAgent()}>
                {busy ? 'Launching…' : status?.mode === 'local' ? 'Run local' : 'Run cloud'}
              </button>
              {!status?.hasApiKey && onOpenIntegrations ? (
                <button type="button" className="x-int-btn x-int-btn-ghost" onClick={onOpenIntegrations}>
                  Connect in Apps
                </button>
              ) : null}
            </div>
            {error ? <p className="x-int-alert">{error}</p> : null}
            {toast ? <p className="x-build-toast">{toast}</p> : null}
          </section>
        </aside>

        <div className="x-build-runs">
          {runningBuilds.length > 0 ? (
            <section className="x-build-runs-section">
              <h2 className="x-build-runs-title">In progress</h2>
              <div className="x-build-runs-active">
                {runningBuilds.map((event) => (
                  <BuildRunCard
                    key={event.id}
                    event={event}
                    now={now}
                    variant="active"
                    stepOverride={
                      event.meta?.agentId
                        ? agentSteps[String(event.meta.agentId)]
                        : undefined
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
            </section>
          ) : (
            <section className="x-build-runs-empty">
              <h2 className="x-build-runs-title">No active builds</h2>
              <p className="x-build-empty">
                Describe what to build on the left and hit <strong>Run local</strong> or{' '}
                <strong>Run cloud</strong>.
              </p>
            </section>
          )}

          <section className="x-build-runs-section">
            <h2 className="x-build-runs-title">History</h2>
            {completedBuilds.length === 0 ? (
              <p className="x-build-empty">Completed builds will show up here.</p>
            ) : (
              <div className="x-build-runs-history">
                {completedBuilds.map((event) => (
                  <BuildRunCard
                    key={event.id}
                    event={event}
                    now={now}
                    onOpenInCursor={
                      event.meta?.projectPath
                        ? () => void openInCursor(String(event.meta?.projectPath))
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
