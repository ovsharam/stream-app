import { useEffect, useMemo, useRef, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { BuildAgentsStatus, BuildExecutor } from '@shared/build-executor'
import {
  BUILD_AGENTS,
  aggregateBuildDashboard,
  buildActivityTimeline,
  buildEventItemId,
  buildEventPrompt,
  buildEventStartedAt,
  buildExecutorFromEvent,
  buildRunStatus,
  collectLiveBuildLogs,
  type BuildRunStatus,
  type BuildThread
} from '@shared/build-dojo'
import { buildTimingLabel } from './BuildRunCard'
import { formatElapsedMs, formatTimeAgo } from './agentDuration'

type Props = {
  events: CentralStreamEvent[]
  threads: BuildThread[]
  buildStatus: BuildAgentsStatus | null
  now: number
  onOpenDojo: (opts: { executor?: BuildExecutor; threadId?: string; streamItemId?: string }) => void
  onNewBuild: () => void
}

const STATUS_COLORS: Record<BuildRunStatus, string> = {
  running: 'var(--x-accent, #c47d5a)',
  done: '#4ade80',
  error: '#f87171'
}

function Sparkline({ trend, highlight }: { trend: BuildRunStatus[]; highlight?: BuildRunStatus }) {
  const slots = trend.slice(-16)
  if (slots.length === 0) {
    return <div className="x-dojo-sparkline x-dojo-sparkline-empty" aria-hidden />
  }
  const barW = 100 / slots.length
  return (
    <svg className="x-dojo-sparkline" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
      {slots.map((status, i) => {
        const dim = highlight != null && status !== highlight
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={status === 'running' ? 4 : status === 'error' ? 10 : 14}
            width={Math.max(barW - 1, 1)}
            height={status === 'running' ? 20 : status === 'error' ? 14 : 10}
            rx={1}
            fill={STATUS_COLORS[status]}
            opacity={dim ? 0.18 : 0.9}
          />
        )
      })}
    </svg>
  )
}

function ActivityChart({ events }: { events: CentralStreamEvent[] }) {
  const buckets = useMemo(() => buildActivityTimeline(events, 24, 12), [events])
  const max = Math.max(1, ...buckets.map((b) => b.total))

  return (
    <div className="x-dojo-chart">
      <div className="x-dojo-chart-legend">
        <span><i className="x-dojo-legend-dot x-dojo-legend-done" /> Done</span>
        <span><i className="x-dojo-legend-dot x-dojo-legend-failed" /> Failed</span>
        <span><i className="x-dojo-legend-dot x-dojo-legend-running" /> Running</span>
      </div>
      <div className="x-dojo-chart-bars" role="img" aria-label="Build activity over last 24 hours">
        {buckets.map((bucket) => {
          const h = (n: number) => `${Math.round((n / max) * 100)}%`
          return (
            <div key={bucket.ts} className="x-dojo-chart-col" title={`${bucket.total} builds`}>
              <div className="x-dojo-chart-stack">
                {bucket.running > 0 ? (
                  <span className="x-dojo-chart-seg x-dojo-chart-seg-running" style={{ height: h(bucket.running) }} />
                ) : null}
                {bucket.failed > 0 ? (
                  <span className="x-dojo-chart-seg x-dojo-chart-seg-failed" style={{ height: h(bucket.failed) }} />
                ) : null}
                {bucket.done > 0 ? (
                  <span className="x-dojo-chart-seg x-dojo-chart-seg-done" style={{ height: h(bucket.done) }} />
                ) : null}
              </div>
              <span className="x-dojo-chart-label">{bucket.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: BuildRunStatus }) {
  const label = status === 'running' ? 'Running' : status === 'error' ? 'Failed' : 'Done'
  return <span className={`x-dojo-badge x-dojo-badge-${status}`}>{label}</span>
}

function executorLabel(id: BuildExecutor | 'unknown' | null): string {
  if (id === 'claude-code') return 'Claude Code'
  if (id === 'cursor-cloud') return 'Cursor Cloud'
  if (id === 'cursor-local') return 'Cursor'
  return 'Unknown'
}

function findThreadForEvent(threads: BuildThread[], event: CentralStreamEvent): BuildThread | undefined {
  const itemId = buildEventItemId(event)
  return threads.find(
    (t) =>
      t.streamItemId === itemId || t.messages.some((m) => m.streamItemId === itemId)
  )
}

function agentReady(status: BuildAgentsStatus | null, id: BuildExecutor): boolean {
  if (!status) return false
  if (id === 'claude-code') return Boolean(status.claudeCode.ready && status.localProjects.length > 0)
  if (id === 'cursor-cloud') return Boolean(status.cursor.hasApiKey && status.cursor.repo)
  return Boolean(status.cursor.hasApiKey && status.localProjects.length > 0)
}

export function BuildDojoDashboard({ events, threads, buildStatus, now, onOpenDojo, onNewBuild }: Props) {
  const stats = useMemo(() => aggregateBuildDashboard(events), [events])
  const [logFilter, setLogFilter] = useState<BuildExecutor | 'all'>('all')
  const logsRef = useRef<HTMLDivElement>(null)
  const hasRunning = stats.running > 0

  const logLines = useMemo(() => {
    const all = collectLiveBuildLogs(events)
    if (logFilter === 'all') return all
    return all.filter((l) => l.executor === logFilter)
  }, [events, logFilter])

  const projects = buildStatus?.localProjects ?? []
  const activeProject =
    projects.find((p) => p.id === buildStatus?.activeLocalProjectId) ?? projects[0]

  useEffect(() => {
    if (!hasRunning) return
    const el = logsRef.current
    if (!el) return
    el.scrollTop = 0
  }, [logLines, hasRunning])

  const openBuild = (event: CentralStreamEvent) => {
    const executor = buildExecutorFromEvent(event)
    const thread = findThreadForEvent(threads, event)
    onOpenDojo({
      executor: executor ?? undefined,
      threadId: thread?.id,
      streamItemId: buildEventItemId(event)
    })
  }

  return (
    <div className="x-dojo-dashboard">
      <div className="x-dojo-kpi-row">
        <article className="x-dojo-kpi">
          <div className="x-dojo-kpi-head">
            <span className="x-dojo-kpi-val">{stats.running}</span>
            <StatusBadge status="running" />
          </div>
          <span className="x-dojo-kpi-label">Running</span>
          <Sparkline trend={stats.trend} highlight="running" />
        </article>
        <article className="x-dojo-kpi">
          <div className="x-dojo-kpi-head">
            <span className="x-dojo-kpi-val">{stats.completed}</span>
            <StatusBadge status="done" />
          </div>
          <span className="x-dojo-kpi-label">Completed</span>
          <Sparkline trend={stats.trend} highlight="done" />
        </article>
        <article className="x-dojo-kpi">
          <div className="x-dojo-kpi-head">
            <span className="x-dojo-kpi-val">{stats.failed}</span>
            <StatusBadge status="error" />
          </div>
          <span className="x-dojo-kpi-label">Failed</span>
          <Sparkline trend={stats.trend} highlight="error" />
        </article>
        <article className="x-dojo-kpi">
          <div className="x-dojo-kpi-head">
            <span className="x-dojo-kpi-val">
              {stats.successRate != null ? `${stats.successRate}%` : '—'}
            </span>
          </div>
          <span className="x-dojo-kpi-label">Success rate</span>
          <Sparkline trend={stats.trend} />
        </article>
      </div>

      <section className="x-dojo-dash-section">
        <div className="x-dojo-section-head">
          <h2>Agent monitors</h2>
          {activeProject ? <span className="x-dojo-section-meta">Active · {activeProject.name}</span> : null}
        </div>
        <div className="x-dojo-monitor-grid">
          {BUILD_AGENTS.map((agent) => {
            const ready = agentReady(buildStatus, agent.id)
            const agentBuilds = stats.recentBuilds.filter((e) => buildExecutorFromEvent(e) === agent.id)
            const runningEvent = agentBuilds.find((e) => buildRunStatus(e) === 'running')
            const lastEvent = agentBuilds[0]
            const threadCount = threads.filter((t) => t.executor === agent.id).length
            const mode = runningEvent ? 'running' : ready ? 'idle' : 'offline'
            const projectName =
              agent.id === 'cursor-cloud'
                ? buildStatus?.cursor.repo ?? 'No repo'
                : activeProject?.name ?? 'No project'

            return (
              <article key={agent.id} className={`x-dojo-monitor x-dojo-monitor-${mode}`}>
                <div className="x-dojo-monitor-top">
                  <span className={`x-dojo-agent-mark${ready ? ' x-dojo-agent-mark-on' : ''}`}>
                    {agent.short}
                  </span>
                  <span className={`x-dojo-monitor-pill x-dojo-monitor-pill-${mode}`}>
                    {mode === 'running' ? 'Running' : mode === 'idle' ? 'Ready' : 'Offline'}
                  </span>
                </div>
                <strong>{agent.name}</strong>
                <p className="x-dojo-monitor-hint">{agent.hint}</p>
                <dl className="x-dojo-monitor-stats">
                  <div>
                    <dt>Project</dt>
                    <dd title={projectName}>{projectName}</dd>
                  </div>
                  <div>
                    <dt>Last run</dt>
                    <dd>
                      {lastEvent
                        ? formatTimeAgo(buildEventStartedAt(lastEvent), now)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Chats</dt>
                    <dd>{threadCount}</dd>
                  </div>
                </dl>
                {runningEvent ? (
                  <div className="x-dojo-monitor-live">
                    <span className="x-dojo-thread-live" />
                    <span className="x-dojo-monitor-live-title">
                      {buildEventPrompt(runningEvent).slice(0, 48)}
                    </span>
                    <span className="x-dojo-monitor-live-time">
                      {formatElapsedMs(now - buildEventStartedAt(runningEvent))}
                    </span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="x-dojo-ghost x-dojo-monitor-open"
                  onClick={() => onOpenDojo({ executor: agent.id })}
                >
                  Open in Dojo
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <div className="x-dojo-dash-grid">
        <section className="x-dojo-dash-panel x-dojo-chart-panel">
          <div className="x-dojo-section-head">
            <h2>Activity · 24h</h2>
            <span className="x-dojo-section-meta">{stats.recentBuilds.length} recent runs</span>
          </div>
          <ActivityChart events={events} />
        </section>

        <section className="x-dojo-dash-panel x-dojo-logs-panel">
          <div className="x-dojo-section-head">
            <h2>Live logs</h2>
            <div className="x-dojo-logs-filter">
              <button
                type="button"
                className={logFilter === 'all' ? 'x-dojo-filter-active' : ''}
                onClick={() => setLogFilter('all')}
              >
                All
              </button>
              {BUILD_AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={logFilter === a.id ? 'x-dojo-filter-active' : ''}
                  onClick={() => setLogFilter(a.id)}
                >
                  {a.short}
                </button>
              ))}
            </div>
          </div>
          <div className="x-dojo-logs-body" ref={logsRef}>
            {logLines.length === 0 ? (
              <p className="x-dojo-logs-empty">No log lines yet — start a build in Dojo.</p>
            ) : (
              logLines.map((line) => (
                <div key={line.id} className={`x-dojo-log-line x-dojo-log-line-${line.status}`}>
                  <span className="x-dojo-log-ts">
                    {new Date(line.ts).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                  <span className="x-dojo-log-exec">{executorLabel(line.executor)}</span>
                  <span className="x-dojo-log-text">{line.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="x-dojo-dash-section">
        <div className="x-dojo-section-head">
          <h2>Recent builds</h2>
          <button type="button" className="x-dojo-primary x-dojo-dash-cta" onClick={onNewBuild}>
            New build
          </button>
        </div>
        {stats.recentBuilds.length === 0 ? (
          <p className="x-dojo-logs-empty">No builds yet.</p>
        ) : (
          <div className="x-dojo-builds-table-wrap">
            <table className="x-dojo-builds-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Executor</th>
                  <th>Project</th>
                  <th>Duration</th>
                  <th>Prompt</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBuilds.slice(0, 20).map((event) => {
                  const status = buildRunStatus(event)
                  const executor = buildExecutorFromEvent(event)
                  const project = event.meta?.projectName ? String(event.meta.projectName) : '—'
                  const prompt = buildEventPrompt(event)
                  return (
                    <tr
                      key={event.id}
                      className="x-dojo-builds-row"
                      onClick={() => openBuild(event)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openBuild(event)
                        }
                      }}
                    >
                      <td>
                        <StatusBadge status={status} />
                      </td>
                      <td>{executorLabel(executor)}</td>
                      <td className="x-dojo-builds-project" title={project}>
                        {project}
                      </td>
                      <td className="x-dojo-builds-time">{buildTimingLabel(event, now)}</td>
                      <td className="x-dojo-builds-prompt" title={prompt}>
                        {prompt.slice(0, 72)}
                        {prompt.length > 72 ? '…' : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
