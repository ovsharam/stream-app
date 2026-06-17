import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HandoffBrief } from '@shared/handoff'
import type { FdeEngagement, EngagementStage, ScopeBucket } from '@shared/fde-engagement'
import { PIPELINE_STAGES } from '@shared/pipeline'
import type { AgentProposal } from '@shared/agent-proposal'
import { cleanLinkedInSenderName, summarizeInboundMessage } from '@shared/agent-proposal-ui'
import { agentApi, clusterApi } from '../lib/api'
import { trackOperatorEvent } from '../lib/operatorTelemetry'
import { openLinkedInProposalSource } from './openAgentProposalSource'
import { useEngagements } from './useEngagements'

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
  onOpenMeeting?: (feedItemId: string) => void
  onOpenBuild?: () => void
  onOpenAgentQueue?: () => void
}

export function PipelineView({ onOpenMeeting, onOpenBuild, onOpenAgentQueue }: Props) {
  const { engagements, refreshing, pendingIds, patch, create, load: reloadEngagements } = useEngagements()
  const [proposals, setProposals] = useState<AgentProposal[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<HandoffBrief | null>(null)
  const [creating, setCreating] = useState(false)

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

  useEffect(() => {
    if (!selectedId) {
      setHandoff(null)
      return
    }
    trackOperatorEvent(
      'feed_context_select',
      { itemId: selectedId, via: 'pipeline_deal' },
      { surface: 'pipeline', subjectType: 'engagement', subjectId: selectedId }
    )
    void clusterApi.engagementHandoff(selectedId).then((d) => setHandoff(d.handoff)).catch(() => setHandoff(null))
  }, [selectedId])

  const byStage = useMemo(() => {
    const map: Record<EngagementStage, FdeEngagement[]> = {
      intake: [],
      build: [],
      maintenance: [],
      paused: []
    }
    for (const e of engagements) {
      map[e.stage]?.push(e)
    }
    for (const stage of Object.keys(map) as EngagementStage[]) {
      map[stage].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return map
  }, [engagements])

  const proposalById = useMemo(() => {
    const map = new Map<string, AgentProposal>()
    for (const p of proposals) map.set(p.id, p)
    return map
  }, [proposals])

  const selected = selectedId ? engagements.find((e) => e.id === selectedId) ?? null : null
  const linkedProposals = useMemo(() => {
    if (!selected?.proposalIds?.length) return []
    return selected.proposalIds
      .map((id) => proposalById.get(id))
      .filter((p): p is AgentProposal => p != null)
  }, [selected, proposalById])

  const handleNewClient = async () => {
    const name = window.prompt('Client or company name')
    if (!name?.trim()) return
    setCreating(true)
    try {
      const engagement = await create({ clientName: name.trim() })
      setSelectedId(engagement.id)
    } finally {
      setCreating(false)
    }
  }

  const moveStage = (id: string, stage: EngagementStage) => {
    void patch(id, { stage })
  }

  const openAgentQueue = () => {
    trackOperatorEvent('agent_proposal_view', { via: 'pipeline_toolbar' }, { surface: 'pipeline' })
    onOpenAgentQueue?.()
  }

  const openLinkedProposal = (proposal: AgentProposal, via: 'pipeline_deal_detail' | 'pipeline_go_to') => {
    if (via === 'pipeline_go_to') {
      openLinkedInProposalSource({
        threadId: proposal.threadId,
        senderName: proposal.senderName,
        proposalId: proposal.id
      })
      return
    }
    trackOperatorEvent(
      'agent_proposal_fork',
      { proposalId: proposal.id, via: 'pipeline_deal_detail' },
      { surface: 'pipeline', subjectType: 'agent_proposal', subjectId: proposal.id }
    )
    onOpenAgentQueue?.()
  }

  return (
    <div className="x-pipeline">
      <header className="x-pipeline-toolbar">
        <div className="x-pipeline-toolbar-main">
          <h1 className="x-pipeline-title">Pipeline</h1>
          <span className="x-pipeline-toolbar-meta">
            {engagements.length} deal{engagements.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="x-pipeline-toolbar-actions">
          {proposals.length > 0 ? (
            <button type="button" className="x-pipeline-agent-pill" onClick={openAgentQueue}>
              {proposals.length} agent draft{proposals.length === 1 ? '' : 's'}
            </button>
          ) : null}
          {onOpenBuild ? (
            <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={onOpenBuild}>
              Build Dojo
            </button>
          ) : null}
          <button
            type="button"
            className="x-pipeline-btn x-pipeline-btn-primary"
            disabled={creating}
            onClick={() => void handleNewClient()}
          >
            + New deal
          </button>
        </div>
      </header>

      <div className="x-pipeline-metrics" aria-label="Pipeline summary">
        {PIPELINE_STAGES.map((col) => (
          <div key={col.id} className="x-pipeline-metric">
            <span className="x-pipeline-metric-value">{byStage[col.id].length}</span>
            <span className="x-pipeline-metric-label">{col.label}</span>
          </div>
        ))}
      </div>

      <div className={`x-pipeline-body${selected ? ' x-pipeline-body-detail' : ''}`}>
        <div className={`x-pipeline-board${refreshing ? ' x-pipeline-board-refreshing' : ''}`}>
          {PIPELINE_STAGES.map((col) => (
            <section key={col.id} className="x-pipeline-col">
              <header className="x-pipeline-col-head">
                <div className="x-pipeline-col-head-row">
                  <h3>{col.label}</h3>
                  <span className="x-pipeline-col-count">{byStage[col.id].length}</span>
                </div>
                <p className="x-pipeline-col-hint">{col.hint}</p>
              </header>
              <ul className="x-pipeline-col-list">
                {byStage[col.id].length === 0 ? (
                  <li className="x-pipeline-col-empty">No deals</li>
                ) : (
                  byStage[col.id].map((e) => {
                    const linkedPending = (e.proposalIds ?? []).some((id) => proposalById.has(id))
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          className={`x-pipeline-card${selectedId === e.id ? ' active' : ''}${e.escalationLevel > 0 ? ' alert' : ''}${pendingIds.has(e.id) ? ' pending' : ''}`}
                          onClick={() => setSelectedId(e.id)}
                        >
                          <div className="x-pipeline-card-top">
                            <strong>{e.clientName}</strong>
                            <span className={`x-eng-scope x-eng-scope-${e.scope}`}>
                              {SCOPE_LABEL[e.scope]}
                            </span>
                          </div>
                          {e.company ? <p className="x-pipeline-card-co">{e.company}</p> : null}
                          {e.summary ? (
                            <p className="x-pipeline-card-summary">
                              {e.summary.slice(0, 120)}
                              {e.summary.length > 120 ? '…' : ''}
                            </p>
                          ) : null}
                          <div className="x-pipeline-card-foot">
                            <span className="x-pipeline-card-time">{formatRelative(e.updatedAt)}</span>
                            <div className="x-pipeline-card-foot-tags">
                              {linkedPending ? (
                                <span className="x-pipeline-agent-dot" title="Agent draft linked">
                                  agent
                                </span>
                              ) : null}
                              {e.signalSources?.slice(0, 2).map((s) => (
                                <span key={s} className="x-pipeline-signal">
                                  {SIGNAL_LABEL[s] ?? s}
                                </span>
                              ))}
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

        {selected ? (
          <aside className="x-pipeline-detail" aria-label="Deal detail">
            <header className="x-pipeline-detail-head">
              <div>
                <h2>{selected.clientName}</h2>
                {selected.company ? <p className="x-pipeline-detail-co">{selected.company}</p> : null}
              </div>
              <button
                type="button"
                className="x-pipeline-detail-close"
                aria-label="Close detail"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </header>

            <div className="x-pipeline-detail-meta">
              <span className={`x-eng-scope x-eng-scope-${selected.scope}`}>
                {SCOPE_LABEL[selected.scope]}
              </span>
              <span className="x-pipeline-detail-stage">{selected.stage}</span>
              {selected.escalationLevel > 0 ? (
                <span className="x-pipeline-escalation">
                  {selected.escalationLevel === 2 ? 'Escalated' : 'Needs attention'}
                </span>
              ) : null}
            </div>

            {selected.summary ? <p className="x-pipeline-detail-summary">{selected.summary}</p> : null}

            {linkedProposals.length > 0 ? (
              <section className="x-pipeline-detail-block x-pipeline-agent-signals">
                <h3>Agent signals</h3>
                <p className="x-pipeline-agent-signals-hint">
                  Drafts stay in Agent — open to review, edit, or fork from the LLM path.
                </p>
                <ul className="x-pipeline-agent-signals-list">
                  {linkedProposals.map((p) => (
                    <li key={p.id}>
                      <div className="x-pipeline-agent-signal-row">
                        <button
                          type="button"
                          className="x-pipeline-agent-signal-main"
                          onClick={() => openLinkedProposal(p, 'pipeline_deal_detail')}
                        >
                          <span className="x-pipeline-agent-signal-source">LinkedIn</span>
                          <span className="x-pipeline-agent-signal-who">
                            {cleanLinkedInSenderName(p.senderName)}
                          </span>
                          <span className="x-pipeline-agent-signal-preview">
                            {summarizeInboundMessage({
                              rawMessage: p.rawMessage,
                              senderName: p.senderName,
                              brief: p.brief,
                              threadMessages: p.threadMessages
                            })}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="x-pipeline-agent-signal-goto"
                          onClick={() => openLinkedProposal(p, 'pipeline_go_to')}
                        >
                          Go to
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {handoff ? (
              <section className="x-pipeline-detail-block x-pipeline-handoff">
                <h3>AE ↔ FDE handoff</h3>
                <p className="x-pipeline-handoff-gap">{handoff.gapSummary}</p>
                <p className="x-pipeline-handoff-motion">{handoff.fdeMotion}</p>
                {handoff.aeActions.length > 0 ? (
                  <>
                    <h4>AE</h4>
                    <ul>
                      {handoff.aeActions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {handoff.fdeActions.length > 0 ? (
                  <>
                    <h4>FDE</h4>
                    <ul>
                      {handoff.fdeActions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </section>
            ) : null}

            {selected.nextSteps.length > 0 ? (
              <section className="x-pipeline-detail-block">
                <h3>Next steps</h3>
                <ul>
                  {selected.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selected.openQuestions.length > 0 ? (
              <section className="x-pipeline-detail-block">
                <h3>Open questions</h3>
                <ul>
                  {selected.openQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {selected.buildPrompt ? (
              <section className="x-pipeline-detail-block">
                <h3>Build brief</h3>
                <pre className="x-pipeline-build-prompt">{selected.buildPrompt}</pre>
              </section>
            ) : null}

            <div className="x-pipeline-detail-actions">
              {selected.feedItemIds.length > 0 && onOpenMeeting ? (
                <button
                  type="button"
                  className="x-pipeline-detail-btn"
                  onClick={() =>
                    onOpenMeeting(selected.feedItemIds[selected.feedItemIds.length - 1]!.replace(/^ext-/, ''))
                  }
                >
                  Review call
                </button>
              ) : null}
              {selected.stage === 'intake' ? (
                <button
                  type="button"
                  className="x-pipeline-detail-btn x-pipeline-detail-btn-primary"
                  onClick={() => moveStage(selected.id, 'build')}
                >
                  FDE → Build
                </button>
              ) : null}
              {selected.stage === 'build' ? (
                <button
                  type="button"
                  className="x-pipeline-detail-btn x-pipeline-detail-btn-primary"
                  onClick={() => moveStage(selected.id, 'maintenance')}
                >
                  Mark live
                </button>
              ) : null}
              {selected.stage !== 'paused' ? (
                <button
                  type="button"
                  className="x-pipeline-detail-btn x-pipeline-detail-btn-muted"
                  onClick={() => moveStage(selected.id, 'paused')}
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="x-pipeline-detail-btn"
                  onClick={() => moveStage(selected.id, 'intake')}
                >
                  Reopen intake
                </button>
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {engagements.length === 0 && !refreshing ? (
        <p className="x-pipeline-empty">
          Deals populate from calls, inbound signals, and agent routing. Add one manually or finish a discovery
          call with ⌘⇧K.
        </p>
      ) : null}
    </div>
  )
}
