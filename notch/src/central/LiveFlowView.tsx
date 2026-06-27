import { useCallback, useMemo, useRef, useState } from 'react'
import {
  FLOW_STAGE_LABELS,
  type FlowBuildPlan,
  type FlowEmail,
  type FlowExtracted,
  type FlowScore,
  type FlowStageId
} from '@shared/fde-flow'
import { clusterApi } from '../lib/api'
import { storeFlowEmail } from './flowEmailStorage'

const SAMPLE_INTAKE = `Discovery call — Northwind Telephony × Acme Voice AI
Date: 2026-05-28 · AE: Jordan · FDE: (you)

Jordan: Thanks for jumping on. Northwind runs inbound sales and support on a legacy Avaya stack. They want your voice agent to look up CRM contacts when a call lands.

Priya (Northwind IT): We use Salesforce Service Cloud. When someone calls, the rep needs the account name, open cases, and last order — basically before they say hello. Near-realtime is fine, I think?

Jordan: What's the latency bar?

Priya: Um, fast enough that the rep isn't waiting awkwardly. We haven't benchmarked it.

Jordan: OAuth for Salesforce — do you have a connected app already?

Priya: Our admin was going to set something up. I'm not sure which scopes they picked. Probably whatever is default.

Priya: Also EU — some callers are German entities. Data can't leave EU for processing if we can help it.

Jordan: Security review timeline?

Priya: Probably 4–6 weeks if we need a new vendor. Faster if it's just an extension of what we already approved with Acme.

FDE: So v1 is Salesforce lookup on inbound call, surfaced to the rep UI. Priya, can you confirm the exact fields reps need on screen?

Priya: Account name, tier, last order date, and any open P1 case. That's the must-have.

Jordan: Let's schedule a technical deep-dive next week. Priya — can you get your Salesforce admin on that call?

[call ends]`

const STAGE_ORDER: Exclude<FlowStageId, 'apply'>[] = [
  'extract',
  'score',
  'build',
  'execute',
  'email'
]

type StageStatus = 'pending' | 'running' | 'done' | 'skipped'

type StageState = {
  status: StageStatus
  ms?: number
}

type Props = {
  onOpenCase: (engagementId: string) => void
  onBack: () => void
}

export function LiveFlowView({ onOpenCase, onBack }: Props) {
  const [intakeText, setIntakeText] = useState(SAMPLE_INTAKE)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stageStates, setStageStates] = useState<Record<string, StageState>>(() =>
    Object.fromEntries(STAGE_ORDER.map((id) => [id, { status: 'pending' as const }]))
  )
  const [extracted, setExtracted] = useState<FlowExtracted | null>(null)
  const [scoreResult, setScoreResult] = useState<FlowScore | null>(null)
  const [buildPlan, setBuildPlan] = useState<FlowBuildPlan | null>(null)
  const [filesWritten, setFilesWritten] = useState<string[]>([])
  const [email, setEmail] = useState<FlowEmail | null>(null)
  const [engagementId, setEngagementId] = useState<string | null>(null)
  const [totalMs, setTotalMs] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const resetRun = useCallback(() => {
    setError(null)
    setExtracted(null)
    setScoreResult(null)
    setBuildPlan(null)
    setFilesWritten([])
    setEmail(null)
    setEngagementId(null)
    setTotalMs(null)
    setStageStates(Object.fromEntries(STAGE_ORDER.map((id) => [id, { status: 'pending' as const }])))
  }, [])

  const runFlow = useCallback(
    async (skipExecute: boolean) => {
      const text = intakeText.trim()
      if (!text) {
        setError('Paste intake text to run the demo.')
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      resetRun()
      setRunning(true)

      if (skipExecute) {
        setStageStates((prev) => ({
          ...prev,
          execute: { status: 'skipped' }
        }))
      }

      try {
        await clusterApi.runFlowStream(
          { intakeText: text, skipExecute },
          (event) => {
            if (event.stage === 'error') {
              setError(event.message)
              return
            }

            if (event.stage === 'complete') {
              setEngagementId(event.engagementId)
              setEmail(event.email)
              setFilesWritten(event.filesWritten)
              setTotalMs(event.totalMs)
              storeFlowEmail(event.engagementId, event.email)
              window.dispatchEvent(new Event('notch:engagements-updated'))
              return
            }

            if (event.status === 'running') {
              setStageStates((prev) => ({
                ...prev,
                [event.stage]: { status: 'running' }
              }))
              return
            }

            if (event.status === 'done') {
              setStageStates((prev) => ({
                ...prev,
                [event.stage]: { status: 'done', ms: event.ms }
              }))
              if (event.stage === 'extract') setExtracted(event.output as FlowExtracted)
              if (event.stage === 'score') setScoreResult(event.output as FlowScore)
              if (event.stage === 'build') setBuildPlan(event.output as FlowBuildPlan)
              if (event.stage === 'execute') {
                const exec = event.output as { filesWritten?: string[] }
                if (exec.filesWritten) setFilesWritten(exec.filesWritten)
              }
              if (event.stage === 'email') setEmail(event.output as FlowEmail)
            }
          },
          { signal: controller.signal }
        )
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    [intakeText, resetRun]
  )

  const complete = Boolean(engagementId && !running)

  const summaryLines = useMemo(() => {
    if (!complete) return []
    const lines: string[] = []
    if (extracted) lines.push(`Client: ${extracted.client}`)
    if (scoreResult) {
      lines.push(`Context score: ${scoreResult.contextScore}/100`)
      lines.push(`Gaps: ${scoreResult.gaps.length}`)
    }
    if (filesWritten.length > 0) lines.push(`Files written: ${filesWritten.length}`)
    if (email) lines.push(`Email: ${email.subject}`)
    if (totalMs != null) lines.push(`Total: ${(totalMs / 1000).toFixed(1)}s`)
    return lines
  }, [complete, extracted, scoreResult, filesWritten.length, email, totalMs])

  const cancelRun = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  return (
    <div className="x-live-flow">
      <header className="x-pipeline-toolbar x-live-flow-toolbar">
        <div className="x-pipeline-toolbar-main">
          <div className="x-pipeline-breadcrumb">
            <button type="button" className="x-live-flow-back" onClick={onBack}>
              Pipeline
            </button>
            <span className="x-pipeline-breadcrumb-sep">/</span>
            <span>Live demo</span>
          </div>
          <h1 className="x-pipeline-title">Intake → deploy</h1>
        </div>
        <div className="x-pipeline-toolbar-actions">
          {running ? (
            <button type="button" className="x-pipeline-btn x-pipeline-btn-muted" onClick={cancelRun}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="x-pipeline-btn x-pipeline-btn-muted"
            disabled={running}
            onClick={() => void runFlow(true)}
          >
            Fast demo
          </button>
          <button
            type="button"
            className="x-pipeline-btn x-pipeline-btn-primary"
            disabled={running}
            onClick={() => void runFlow(false)}
          >
            Run full demo
          </button>
        </div>
      </header>

      <div className="x-live-flow-body">
        <section className="x-live-flow-intake">
          <label className="x-live-flow-label" htmlFor="live-flow-intake">
            Intake transcript
          </label>
          <textarea
            id="live-flow-intake"
            className="x-live-flow-textarea"
            value={intakeText}
            onChange={(e) => setIntakeText(e.target.value)}
            disabled={running}
            spellCheck={false}
          />
        </section>

        <section className="x-live-flow-stepper-wrap">
          <ol className="x-live-flow-stepper" aria-label="Flow stages">
            {STAGE_ORDER.map((stageId) => {
              const state = stageStates[stageId] ?? { status: 'pending' }
              const label = FLOW_STAGE_LABELS[stageId]
              return (
                <li
                  key={stageId}
                  className={`x-live-flow-step x-live-flow-step-${state.status}`}
                >
                  <div className="x-live-flow-step-content">
                    <div className="x-live-flow-step-head">
                      <span className="x-live-flow-step-label">{label}</span>
                      <span className={`x-live-flow-step-status x-live-flow-step-status-${state.status}`}>
                        {state.status === 'pending'
                          ? 'Pending'
                          : state.status === 'running'
                            ? 'Running…'
                            : state.status === 'skipped'
                              ? 'Skipped'
                              : state.ms != null
                                ? `${(state.ms / 1000).toFixed(1)}s`
                                : 'Done'}
                      </span>
                    </div>
                    {stageId === 'extract' && extracted ? (
                      <p className="x-live-flow-step-detail">
                        {extracted.client} · {extracted.requirements.length} requirements
                      </p>
                    ) : null}
                    {stageId === 'score' && scoreResult ? (
                      <p className="x-live-flow-step-detail">
                        Score {scoreResult.contextScore} · {scoreResult.gaps.length} gaps
                      </p>
                    ) : null}
                    {stageId === 'build' && buildPlan ? (
                      <p className="x-live-flow-step-detail">{buildPlan.summary.slice(0, 120)}…</p>
                    ) : null}
                    {stageId === 'execute' && filesWritten.length > 0 ? (
                      <p className="x-live-flow-step-detail">{filesWritten.length} files generated</p>
                    ) : null}
                    {stageId === 'email' && email ? (
                      <p className="x-live-flow-step-detail">{email.subject}</p>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>

          {error ? <p className="x-live-flow-error">{error}</p> : null}

          {complete && engagementId ? (
            <div className="x-live-flow-complete">
              <ul className="x-live-flow-summary">
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button
                type="button"
                className="x-pipeline-btn x-pipeline-btn-primary x-live-flow-open-case"
                onClick={() => onOpenCase(engagementId)}
              >
                Open case
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
