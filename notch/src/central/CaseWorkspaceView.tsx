import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FdeEngagement, EngagementStage } from '@shared/fde-engagement'
import type { FdeRequirement, FdeDecisionEvent } from '@shared/fde-training'
import type { HandoffBrief } from '@shared/handoff'
import { canAdvanceFromContext, computeContextScore, CONTEXT_GATE } from '@shared/fde-context'
import { PIPELINE_STAGES } from '@shared/pipeline'
import { CASE_WORKSPACE_TABS, type CaseWorkspaceTab } from '@shared/fde-workspace'
import { clusterApi, integrationApi } from '../lib/api'
import { trackOperatorEvent } from '../lib/operatorTelemetry'
import { useEngagements } from './useEngagements'
import { engagementRef } from './pipelineDisplay'
import { readFlowEmail } from './flowEmailStorage'

const SCOPE_LABEL = {
  quick_win: 'Quick win',
  big_bet: 'Big bet',
  unknown: 'Scope TBD'
} as const

const SIGNAL_LABEL: Record<NonNullable<FdeEngagement['signalSources']>[number], string> = {
  linkedin: 'LinkedIn',
  gmail: 'Gmail',
  meeting: 'Meeting',
  monday: 'Monday',
  slack: 'Slack'
}

type Props = {
  caseId: string
  initialTab?: CaseWorkspaceTab
  onBack: () => void
  onOpenMeeting?: (feedItemId: string) => void
  onOpenBuild?: (input: { engagementId: string; prompt?: string }) => void
  onOpenInbox?: () => void
}

export function CaseWorkspaceView({
  caseId,
  initialTab,
  onBack,
  onOpenMeeting,
  onOpenBuild,
  onOpenInbox
}: Props) {
  const { engagements, patch, remove, load } = useEngagements()
  const engagement = engagements.find((e) => e.id === caseId) ?? null
  const [tab, setTab] = useState<CaseWorkspaceTab>(initialTab ?? 'overview')
  const [handoff, setHandoff] = useState<HandoffBrief | null>(null)
  const [requirements, setRequirements] = useState<FdeRequirement[]>([])
  const [decisions, setDecisions] = useState<FdeDecisionEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [stageError, setStageError] = useState<string | null>(null)
  const [buildPromptDraft, setBuildPromptDraft] = useState<string | null>(null)
  const [promptSaving, setPromptSaving] = useState(false)
  const [buildLaunching, setBuildLaunching] = useState(false)

  const refreshExtras = useCallback(async () => {
    if (!caseId) return
    const [reqRes, decRes, handoffRes] = await Promise.all([
      clusterApi.engagementRequirements(caseId).catch(() => ({ requirements: [] as FdeRequirement[] })),
      clusterApi.trainingDecisions(caseId).catch(() => ({ events: [] as FdeDecisionEvent[] })),
      clusterApi.engagementHandoff(caseId).catch(() => null)
    ])
    setRequirements(reqRes.requirements)
    setDecisions(decRes.events)
    setHandoff(handoffRes?.handoff ?? null)
  }, [caseId])

  useEffect(() => {
    void load({ silent: true })
  }, [load, caseId])

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [caseId, initialTab])

  useEffect(() => {
    trackOperatorEvent('feed_context_select', { itemId: caseId, via: 'case_workspace' }, {
      surface: 'case',
      subjectType: 'engagement',
      subjectId: caseId
    })
    void refreshExtras()
  }, [caseId, refreshExtras])

  const derivedRequirements = useMemo(() => {
    if (!engagement) return []
    if (requirements.length > 0) return requirements
    const rows: { id: string; field: string; value: string; status: string }[] = []
    for (const q of engagement.openQuestions) {
      rows.push({ id: `oq-${q}`, field: 'open_question', value: q, status: 'open' })
    }
    for (const s of engagement.nextSteps) {
      rows.push({ id: `ns-${s}`, field: 'next_step', value: s, status: 'open' })
    }
    for (const f of engagement.flags) {
      rows.push({ id: `fl-${f}`, field: 'risk', value: f, status: 'open' })
    }
    return rows
  }, [engagement, requirements])

  if (!engagement) {
    return (
      <div className="x-case-workspace x-case-workspace-empty">
        <button type="button" className="x-btn x-btn-muted" onClick={onBack}>
          ← Pipeline
        </button>
        <p>Case not found.</p>
      </div>
    )
  }

  const stageLabel =
    PIPELINE_STAGES.find((s) => s.id === engagement.stage)?.label ?? engagement.stage
  const contextScore = engagement.contextScore ?? computeContextScore(engagement)
  const canAdvanceBuild = canAdvanceFromContext(contextScore)
  const flowEmail = readFlowEmail(caseId)

  const moveStage = async (stage: EngagementStage) => {
    setStageError(null)
    if (stage === 'build' && engagement.stage === 'context' && !canAdvanceBuild) {
      setStageError(`Context score ${contextScore} is below ${CONTEXT_GATE}. Review requirements before build.`)
      return
    }
    try {
      await patch(engagement.id, { stage })
    } catch {
      setStageError(`Could not move to ${stage}. Context score may be below ${CONTEXT_GATE}.`)
    }
  }

  const approveScope = () => {
    void patch(engagement.id, { scopeApproved: true, scope: engagement.scope === 'unknown' ? 'quick_win' : engagement.scope })
  }

  const runBuild = async () => {
    setBuildLaunching(true)
    const prompt = buildPromptDraft ?? engagement.buildPrompt
    if (buildPromptDraft !== null && buildPromptDraft !== engagement.buildPrompt) {
      try {
        await patch(engagement.id, { buildPrompt: buildPromptDraft })
      } catch { /* non-fatal */ }
    }
    if (engagement.stage === 'intake' || engagement.stage === 'context') {
      try { await patch(engagement.id, { stage: 'build' }) } catch { /* non-fatal */ }
    }
    onOpenBuild?.({ engagementId: engagement.id, prompt: prompt ?? undefined })
    setBuildLaunching(false)
  }

  const savePrompt = async () => {
    if (buildPromptDraft === null) return
    setPromptSaving(true)
    try {
      await patch(engagement.id, { buildPrompt: buildPromptDraft })
    } finally {
      setPromptSaving(false)
    }
  }

  const deleteCase = async () => {
    if (!window.confirm(`Archive case for ${engagement.clientName}?`)) return
    setBusy(true)
    try {
      await remove(engagement.id)
      onBack()
    } finally {
      setBusy(false)
    }
  }

  const patchRequirement = async (reqId: string, status: FdeRequirement['status']) => {
    if (reqId.startsWith('oq-') || reqId.startsWith('ns-') || reqId.startsWith('fl-')) return
    await clusterApi.patchRequirement(reqId, status)
    await refreshExtras()
  }

  return (
    <div className="x-case-workspace">
      <header className="x-case-workspace-head">
        <div className="x-case-workspace-head-top">
          <button type="button" className="x-case-back" onClick={onBack}>
            ← Pipeline
          </button>
          <div className="x-case-workspace-head-actions">
            <button type="button" className="x-btn x-btn-muted" onClick={() => onOpenInbox?.()}>
              Inbox
            </button>
            <button
              type="button"
              className="x-btn x-btn-primary"
              disabled={!engagement.buildPrompt && engagement.stage === 'intake'}
              onClick={runBuild}
            >
              Run build agent
            </button>
          </div>
        </div>
        <div className="x-case-workspace-head-main">
          <div className="x-case-workspace-title-block">
            <span className="x-pipeline-card-id">{engagementRef(engagement)}</span>
            <h1>{engagement.clientName}</h1>
            {engagement.company ? <p className="x-case-co">{engagement.company}</p> : null}
          </div>
          <div className="x-case-workspace-head-meta">
            <span className={`x-eng-scope x-eng-scope-${engagement.scope}`}>
              {SCOPE_LABEL[engagement.scope]}
            </span>
            <span className="x-case-stage-pill">{stageLabel}</span>
            {engagement.escalationLevel > 0 ? (
              <span className="x-case-escalation">Needs attention</span>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="x-case-tabs" aria-label="Case sections">
        {CASE_WORKSPACE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`x-case-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="x-case-tab-label">{t.label}</span>
            <span className="x-case-tab-hint">{t.hint}</span>
          </button>
        ))}
      </nav>

      <div className="x-case-workspace-body">
        {tab === 'overview' ? (
          <div className="x-case-panel-grid">
            <section className="x-case-panel">
              <h2>Context score</h2>
              <div className="x-case-context-score">
                <div className="x-case-context-score-head">
                  <span className="x-case-context-score-value">{contextScore}</span>
                  <span className="x-case-context-score-target">/ 100 · gate {CONTEXT_GATE}</span>
                </div>
                <div className="x-case-context-score-bar" aria-hidden>
                  <div
                    className={`x-case-context-score-fill${canAdvanceBuild ? ' ready' : ''}`}
                    style={{ width: `${contextScore}%` }}
                  />
                </div>
                {!canAdvanceBuild && engagement.stage === 'context' ? (
                  <p className="x-case-muted">Complete requirements and scope before advancing to build.</p>
                ) : null}
              </div>
            </section>
            <section className="x-case-panel">
              <h2>Scope</h2>
              {engagement.summary ? (
                <p className="x-case-prose">{engagement.summary}</p>
              ) : (
                <p className="x-case-muted">No summary yet — link a meeting or paste intake notes.</p>
              )}
              <div className="x-case-actions-row">
                {engagement.stage === 'intake' ? (
                  <button type="button" className="x-btn x-btn-primary" onClick={() => moveStage('context')}>
                    Move to context
                  </button>
                ) : null}
                {engagement.stage === 'context' ? (
                  <button
                    type="button"
                    className="x-btn x-btn-primary"
                    disabled={!canAdvanceBuild}
                    onClick={() => moveStage('build')}
                  >
                    Move to build
                  </button>
                ) : null}
                {engagement.scope === 'unknown' ? (
                  <button type="button" className="x-btn x-btn-muted" onClick={approveScope}>
                    Approve scope
                  </button>
                ) : null}
                {engagement.stage === 'build' ? (
                  <button type="button" className="x-btn x-btn-primary" onClick={() => moveStage('test')}>
                    Move to test
                  </button>
                ) : null}
                {engagement.stage === 'test' ? (
                  <button type="button" className="x-btn x-btn-primary" onClick={() => moveStage('deploy')}>
                    Mark deployed
                  </button>
                ) : null}
              </div>
              {stageError ? <p className="x-case-stage-error">{stageError}</p> : null}
            </section>
            {handoff ? (
              <section className="x-case-panel">
                <h2>AE ↔ FDE handoff</h2>
                <p className="x-case-prose">{handoff.gapSummary}</p>
                <p className="x-case-muted">{handoff.fdeMotion}</p>
              </section>
            ) : null}
            {flowEmail ? (
              <section className="x-case-panel">
                <h2>Client email draft</h2>
                <p className="x-case-muted">{flowEmail.subject}</p>
                <pre className="x-case-email-body">{flowEmail.body}</pre>
              </section>
            ) : null}
          </div>
        ) : null}

        {tab === 'requirements' ? (
          <section className="x-case-panel x-case-panel-wide">
            <h2>Build requirements</h2>
            <p className="x-case-muted">
              Extracted from meetings and channels — confirm before agents execute.
            </p>
            <ul className="x-case-req-list">
              {derivedRequirements.length === 0 ? (
                <li className="x-case-muted">No requirements captured yet.</li>
              ) : (
                derivedRequirements.map((r) => (
                  <li key={r.id} className="x-case-req-row">
                    <span className="x-case-req-field">{r.field.replace(/_/g, ' ')}</span>
                    <span className="x-case-req-value">{r.value}</span>
                    {'status' in r && !r.id.startsWith('oq-') ? (
                      <select
                        className="x-case-req-status"
                        value={r.status}
                        onChange={(e) =>
                          void patchRequirement(r.id, e.target.value as FdeRequirement['status'])
                        }
                      >
                        <option value="open">Open</option>
                        <option value="approved">Approved</option>
                        <option value="answered">Answered</option>
                        <option value="deferred">Deferred</option>
                        <option value="out_of_scope">Out of scope</option>
                      </select>
                    ) : (
                      <span className="x-case-req-status-label">{r.status}</span>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>
        ) : null}

        {tab === 'channels' ? (
          <section className="x-case-panel x-case-panel-wide">
            <h2>Channel signals</h2>
            <div className="x-case-chip-row">
              {(engagement.signalSources ?? []).map((s) => (
                <span key={s} className="x-case-chip">
                  {SIGNAL_LABEL[s] ?? s}
                </span>
              ))}
              {(engagement.signalSources ?? []).length === 0 ? (
                <span className="x-case-muted">No channels linked yet.</span>
              ) : null}
            </div>
            <h2 className="x-case-subhead">Linked items</h2>
            <ul className="x-case-link-list">
              {engagement.feedItemIds.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="x-case-link-btn"
                    onClick={() => onOpenMeeting?.(id.replace(/^ext-/, ''))}
                  >
                    {id}
                  </button>
                </li>
              ))}
              {engagement.feedItemIds.length === 0 ? (
                <li className="x-case-muted">Feed items attach when meetings complete or agents route inbound.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {tab === 'meetings' ? (
          <section className="x-case-panel x-case-panel-wide">
            <h2>Meetings</h2>
            <ul className="x-case-link-list">
              {engagement.meetingIds.map((id) => (
                <li key={id}>
                  <span className="x-case-mono">{id}</span>
                  {engagement.googleDocUrl ? (
                    <a className="x-case-link" href={engagement.googleDocUrl} target="_blank" rel="noreferrer">
                      Notes doc
                    </a>
                  ) : null}
                </li>
              ))}
              {engagement.meetingIds.length === 0 ? (
                <li className="x-case-muted">Start a call with ⌘⇧L — transcript and requirements extract on end.</li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {tab === 'build' ? (
          <section className="x-case-panel x-case-panel-wide x-case-build-review">
            <div className="x-case-build-review-header">
              <div>
                <h2>Build brief</h2>
                <p className="x-case-muted">Review and edit the agent prompt before running — every change is saved.</p>
              </div>
              {derivedRequirements.length > 0 ? (
                <span className="x-case-build-req-count">
                  {derivedRequirements.filter((r) => r.status === 'approved' || r.status === 'answered').length}
                  /{derivedRequirements.length} requirements approved
                </span>
              ) : null}
            </div>

            {engagement.buildPrompt || buildPromptDraft !== null ? (
              <div className="x-case-build-editor">
                <textarea
                  className="x-case-build-textarea"
                  value={buildPromptDraft ?? engagement.buildPrompt ?? ''}
                  rows={18}
                  placeholder="Describe what to build — agents will execute this step-by-step."
                  onChange={(e) => setBuildPromptDraft(e.target.value)}
                  onBlur={() => void savePrompt()}
                />
                <div className="x-case-build-editor-footer">
                  {promptSaving ? (
                    <span className="x-case-muted x-case-build-saving">Saving…</span>
                  ) : buildPromptDraft !== null && buildPromptDraft !== engagement.buildPrompt ? (
                    <button type="button" className="x-btn x-btn-muted x-case-build-save" onClick={() => void savePrompt()}>
                      Save
                    </button>
                  ) : (
                    <span className="x-case-muted x-case-build-saving">Auto-saves on exit</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="x-case-build-empty">
                <p className="x-case-muted">Build prompt generates after a discovery call ends. You can also write one now.</p>
                <textarea
                  className="x-case-build-textarea"
                  rows={10}
                  placeholder="Describe what to build…"
                  onChange={(e) => setBuildPromptDraft(e.target.value)}
                />
              </div>
            )}

            <div className="x-case-build-actions">
              <button
                type="button"
                className="x-btn x-btn-primary x-case-build-ship"
                disabled={buildLaunching || (!engagement.buildPrompt && !buildPromptDraft)}
                onClick={() => void runBuild()}
              >
                {buildLaunching ? 'Launching…' : '▶ Approve & run in Cursor'}
              </button>
              <span className="x-case-muted x-case-build-hint">Moves case to Build and starts the agent</span>
            </div>
          </section>
        ) : null}

        {tab === 'activity' ? (
          <section className="x-case-panel x-case-panel-wide">
            <h2>Activity</h2>
            <ul className="x-case-activity-list">
              {decisions.map((e) => (
                <li key={e.id}>
                  <span className="x-case-mono">{e.type}</span>
                  <span>{e.humanAction ?? e.autoSuggestion ?? e.outcome ?? e.phase}</span>
                </li>
              ))}
              {decisions.length === 0 ? (
                <li className="x-case-muted">Operator decisions and stage moves appear here as you work the case.</li>
              ) : null}
            </ul>
            <button type="button" className="x-btn x-btn-muted x-case-danger" disabled={busy} onClick={() => void deleteCase()}>
              Archive case
            </button>
          </section>
        ) : null}
      </div>
    </div>
  )
}
