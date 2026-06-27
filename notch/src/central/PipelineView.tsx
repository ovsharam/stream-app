import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { NewCaseModal } from './NewCaseModal'
import type { FdeEngagement, ScopeBucket, EngagementStage } from '@shared/fde-engagement'
import { PIPELINE_STAGES } from '@shared/pipeline'
import type { AgentProposal } from '@shared/agent-proposal'
import {
  buildEventItemId,
  buildEventPrompt,
  buildEventStartedAt,
  buildExecutorFromEvent,
  buildRunStatus,
  isBuildStreamEvent,
  BUILD_AGENTS
} from '@shared/build-dojo'
import { agentApi } from '../lib/api'
import { trackOperatorEvent } from '../lib/operatorTelemetry'
import { useEngagements } from './useEngagements'
import { IconSearch } from './Icons'
import { engagementRef } from './pipelineDisplay'
import { engagementsByPipelineStage, pipelineBuildActivity } from './pipelineBuildActivity'

const SCOPE_LABEL: Record<ScopeBucket, string> = {
  quick_win: 'Quick win',
  big_bet: 'Big bet',
  unknown: 'Scope TBD'
}

const SIGNAL_LABEL: Record<NonNullable<FdeEngagement['signalSources']>[number], string> = {
  linkedin: 'LinkedIn',
  gmail: 'Gmail',
  meeting: 'Call',
  monday: 'Monday',
  slack: 'Slack'
}

function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

type Props = {
  buildEvents?: CentralStreamEvent[]
  onOpenCase: (engagementId: string) => void
  onOpenMeeting?: (feedItemId: string) => void
  onOpenBuild?: () => void
  onOpenAgentQueue?: () => void
  onOpenDemo?: () => void
}

export function PipelineView({ buildEvents, onOpenCase, onOpenMeeting, onOpenBuild, onOpenAgentQueue, onOpenDemo }: Props) {
  const { engagements, refreshing, pendingIds, create, load: reloadEngagements } = useEngagements()
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [creating, setCreating] = useState(false)
  const [newCaseOpen, setNewCaseOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loadProposals = useCallback(async () => {
    try {
      const data = await agentApi.listProposals('pending')
      setProposals(data.proposals)
    } catch {
      setProposals([])
    }
  }, [])

  useEffect(() => {
    void loadProposals()
    const onProposal = () => {
      void loadProposals()
      void reloadEngagements({ silent: true })
    }
    window.addEventListener('notch:agent-proposal', onProposal)
    window.addEventListener('notch:engagements-updated', onProposal)
    return () => {
      window.removeEventListener('notch:agent-proposal', onProposal)
      window.removeEventListener('notch:engagements-updated', onProposal)
    }
  }, [loadProposals, reloadEngagements])

  const buildActivity = useMemo(
    () => pipelineBuildActivity(buildEvents ?? [], engagements),
    [buildEvents, engagements]
  )

  const filteredEngagements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return engagements
    return engagements.filter((e) => {
      const haystack = [e.clientName, e.company, e.summary, engagementRef(e), ...(e.flags ?? []), ...(e.openQuestions ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [engagements, searchQuery])

  const kpis = useMemo(() => {
    const open = engagements.filter((e) => e.stage !== 'deploy' && e.stage !== 'paused').length
    const contextGaps = engagements.filter(
      (e) => e.escalationLevel > 0 || e.openQuestions.length > 0 || e.scope === 'unknown'
    ).length
    const signals = engagements.reduce((n, e) => n + (e.signalSources?.length ?? 0), 0) + proposals.length
    return {
      open,
      building: buildActivity.runningBuilds.length,
      contextGaps,
      signals
    }
  }, [engagements, proposals.length, buildActivity.runningBuilds.length])

  const byStage = useMemo(
    () => engagementsByPipelineStage(filteredEngagements, buildActivity.displayStage),
    [filteredEngagements, buildActivity]
  )

  const linkedBuildIds = useMemo(() => {
    const ids = new Set<string>()
    for (const engagement of engagements) {
      for (const feedItemId of engagement.feedItemIds) {
        ids.add(feedItemId.replace(/^ext-/, ''))
      }
    }
    return ids
  }, [engagements])

  const activeBuilds = useMemo(() => {
    const seen = new Set<string>()
    const rows: CentralStreamEvent[] = []
    for (const event of (buildEvents ?? []).filter(isBuildStreamEvent)) {
      if (buildRunStatus(event) !== 'running') continue
      const id = buildEventItemId(event)
      if (seen.has(id) || linkedBuildIds.has(id)) continue
      seen.add(id)
      rows.push(event)
    }
    return rows.sort((a, b) => buildEventStartedAt(b) - buildEventStartedAt(a))
  }, [buildEvents, linkedBuildIds])

  const stageCount = useCallback(
    (stage: EngagementStage) =>
      byStage[stage].length + (stage === 'build' ? activeBuilds.length : 0),
    [byStage, activeBuilds.length]
  )

  const proposalById = useMemo(() => {
    const map = new Map<string, AgentProposal>()
    for (const p of proposals) map.set(p.id, p)
    return map
  }, [proposals])

  const handleNewClient = async (input: {
    clientName: string
    company?: string
    summary?: string
  }) => {
    setCreating(true)
    try {
      const engagement = await create(input)
      setNewCaseOpen(false)
      onOpenCase(engagement.id)
    } finally {
      setCreating(false)
    }
  }

  const openAgentQueue = () => {
    trackOperatorEvent('agent_proposal_view', { via: 'pipeline_toolbar' }, { surface: 'pipeline' })
    onOpenAgentQueue?.()
  }

  return (
    <div className="x-pipeline">
      <header className="x-pipeline-toolbar">
        <div className="x-pipeline-toolbar-main">
          <h1 className="x-pipeline-title">Pipeline</h1>
          <div className="x-pipeline-kpis-inline" aria-label="Pipeline metrics">
            <span className="x-pipeline-kpi-chip"><strong>{kpis.open}</strong> open</span>
            {kpis.building > 0 ? <span className="x-pipeline-kpi-chip x-pipeline-kpi-chip-accent"><strong>{kpis.building}</strong> building</span> : null}
            {kpis.contextGaps > 0 ? <span className="x-pipeline-kpi-chip x-pipeline-kpi-chip-warn"><strong>{kpis.contextGaps}</strong> gaps</span> : null}
          </div>
        </div>
        <label className="x-pipeline-search">
          <IconSearch className="x-pipeline-search-icon" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search deals…"
            aria-label="Search pipeline"
          />
        </label>
        <div className="x-pipeline-toolbar-actions">
          {buildActivity.runningBuilds.length > 0 ? (
            <button type="button" className="x-pipeline-build-pill" onClick={() => onOpenBuild?.()}>
              {buildActivity.runningBuilds.length} building
            </button>
          ) : null}
          {proposals.length > 0 ? (
            <button type="button" className="x-pipeline-agent-pill" onClick={openAgentQueue}>
              {proposals.length} draft{proposals.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {onOpenBuild ? (
            <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={onOpenBuild}>
              Build Dojo
            </button>
          ) : null}
          {onOpenDemo ? (
            <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={onOpenDemo}>
              Demo
            </button>
          ) : null}
          <button
            type="button"
            className="x-pipeline-btn x-pipeline-btn-primary"
            disabled={creating}
            onClick={() => setNewCaseOpen(true)}
          >
            + New
          </button>
        </div>
      </header>

      <div className="x-pipeline-body">
        <div className={`x-pipeline-board${refreshing ? ' x-pipeline-board-refreshing' : ''}`}>
          {PIPELINE_STAGES.map((col) => (
            <section key={col.id} className="x-pipeline-col">
              <header className="x-pipeline-col-head">
                <div className="x-pipeline-col-head-row">
                  <h3>{col.label}</h3>
                  <span className="x-pipeline-col-count">{stageCount(col.id)}</span>
                </div>
                <p className="x-pipeline-col-hint">{col.hint}</p>
              </header>
              <ul className="x-pipeline-col-list">
                {col.id === 'build'
                  ? activeBuilds.map((event) => {
                      const executor = buildExecutorFromEvent(event) ?? 'unknown'
                      const agent = BUILD_AGENTS.find((a) => a.id === executor)
                      const prompt = buildEventPrompt(event)
                      const step = String(event.meta?.currentStep ?? '').trim()
                      return (
                        <li key={buildEventItemId(event)}>
                          <button
                            type="button"
                            className="x-pipeline-card x-pipeline-build-run"
                            onClick={() => onOpenBuild?.()}
                          >
                            <div className="x-pipeline-card-top">
                              <strong>{agent?.name ?? 'Build agent'}</strong>
                              <span className="x-pipeline-build-live">Running</span>
                            </div>
                            <p className="x-pipeline-card-summary">
                              {prompt.slice(0, 120)}
                              {prompt.length > 120 ? '…' : ''}
                            </p>
                            {step ? <p className="x-pipeline-build-step">{step.slice(0, 100)}</p> : null}
                            <div className="x-pipeline-card-foot">
                              <span className="x-pipeline-card-time">
                                {formatRelative(buildEventStartedAt(event))}
                              </span>
                              <span className="x-pipeline-signal">{agent?.short ?? 'build'}</span>
                            </div>
                          </button>
                        </li>
                      )
                    })
                  : null}
                {byStage[col.id].length === 0 && !(col.id === 'build' && activeBuilds.length > 0) ? (
                  <li className="x-pipeline-col-empty">No deals</li>
                ) : (
                  byStage[col.id].map((e) => {
                    const isBuilding = buildActivity.buildingEngagementIds.has(e.id)
                    const linkedPending = (e.proposalIds ?? []).some((id) => proposalById.has(id))
                    const escClass = e.escalationLevel === 2
                      ? ' x-pipeline-card-esc-2'
                      : e.escalationLevel === 1 ? ' x-pipeline-card-esc-1' : ''
                    const extraSignals = e.signalSources && e.signalSources.length > 3 ? e.signalSources.length - 3 : 0
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          className={`x-pipeline-card${escClass}${pendingIds.has(e.id) ? ' pending' : ''}${isBuilding ? ' x-pipeline-card-building' : ''}`}
                          onClick={() => onOpenCase(e.id)}
                        >
                          <div className="x-pipeline-card-top">
                            <div className="x-pipeline-card-head-main">
                              <span className="x-pipeline-card-id">{engagementRef(e)}</span>
                              <strong>{e.clientName}</strong>
                            </div>
                            <span className={`x-eng-scope x-eng-scope-${e.scope}`}>
                              {SCOPE_LABEL[e.scope]}
                            </span>
                          </div>
                          {e.company ? <p className="x-pipeline-card-co">{e.company}</p> : null}
                          {e.summary ? (
                            <p className="x-pipeline-card-summary">
                              {e.summary.slice(0, 110)}
                              {e.summary.length > 110 ? '…' : ''}
                            </p>
                          ) : null}
                          {e.stage === 'context' && e.contextScore != null ? (
                            <div className="x-pipeline-context-score-wrap">
                              <span className="x-pipeline-context-score-label">Context {e.contextScore}%</span>
                              <div className="x-pipeline-context-score">
                                <div className="x-pipeline-context-score-fill" style={{ width: `${e.contextScore}%` }} />
                              </div>
                            </div>
                          ) : null}
                          {e.nextSteps.length > 0 ? (
                            <p className="x-pipeline-card-next">→ {e.nextSteps[0]}</p>
                          ) : null}
                          <div className="x-pipeline-card-foot">
                            <span className="x-pipeline-card-time">{formatRelative(e.updatedAt)}</span>
                            <div className="x-pipeline-card-foot-tags">
                              {isBuilding ? (
                                <span className="x-pipeline-build-live">Building</span>
                              ) : null}
                              {linkedPending ? (
                                <span className="x-pipeline-agent-dot" title="Agent draft linked">
                                  agent
                                </span>
                              ) : null}
                              {e.openQuestions.length > 0 ? (
                                <span className="x-pipeline-card-gaps" title={e.openQuestions.join('\n')}>
                                  {e.openQuestions.length} gap{e.openQuestions.length > 1 ? 's' : ''}
                                </span>
                              ) : null}
                              {e.meetingIds.length > 0 ? (
                                <span className="x-pipeline-card-mtg">
                                  {e.meetingIds.length} mtg{e.meetingIds.length > 1 ? 's' : ''}
                                </span>
                              ) : null}
                              {e.signalSources?.slice(0, 3).map((s) => (
                                <span key={s} className="x-pipeline-signal">
                                  {SIGNAL_LABEL[s] ?? s}
                                </span>
                              ))}
                              {extraSignals > 0 ? (
                                <span className="x-pipeline-signal">+{extraSignals}</span>
                              ) : null}
                            </div>
                          </div>
                          {e.flags.length > 0 ? (
                            <p className="x-pipeline-card-flag">{e.flags[0]}</p>
                          ) : null}
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </section>
          ))}
        </div>
      </div>

      {engagements.length === 0 && !refreshing ? (
        <p className="x-pipeline-empty">
          Engagements are created from processed meetings, inbound signals, and agent routing — or add one with <strong>+ New</strong>.
        </p>
      ) : filteredEngagements.length === 0 && searchQuery.trim() ? (
        <p className="x-pipeline-empty">No engagements match &ldquo;{searchQuery.trim()}&rdquo;.</p>
      ) : null}

      <NewCaseModal
        open={newCaseOpen}
        busy={creating}
        onClose={() => setNewCaseOpen(false)}
        onCreate={handleNewClient}
      />
    </div>
  )
}
