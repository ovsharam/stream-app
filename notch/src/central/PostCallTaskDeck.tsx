import { useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { captureApi, openBrowserLink } from '../lib/api'
import { parseMeetingActionsMeta, parseMeetingNextSteps } from '@shared/meeting-actions'
import { MeetingActionCards, MeetingActionRunAllButton, useMeetingActionApprovals } from './MeetingActionCards'

type Props = {
  event: CentralStreamEvent
  onDismiss?: () => void
  onRefresh?: () => void
}

function formatWhen(ts: CentralStreamEvent['timestamp']): string | undefined {
  if (!ts) return undefined
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Avoid showing locale date strings as the hero title when pipeline had no session title. */
function postCallHeadings(event: CentralStreamEvent): { heading: string; when?: string } {
  const stripped = event.title.replace(/^Meeting ·\s*/i, '').trim()
  const when = formatWhen(event.timestamp)
  const looksLikeFallbackDate =
    !stripped ||
    /^\d{1,2}[/.-]\d{1,2}/.test(stripped) ||
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(stripped)

  if (looksLikeFallbackDate) {
    return { heading: 'Call wrap-up', when: when ?? (stripped || undefined) }
  }
  return { heading: stripped, when }
}

function summaryLine(body: string): string {
  const line = body.split('\n').find((l) => l.trim() && !l.startsWith('Scope:'))?.trim()
  return line ?? body.split('\n')[0]?.trim() ?? ''
}

function Chevron() {
  return (
    <span className="x-post-call-chevron" aria-hidden>
      ›
    </span>
  )
}

export function PostCallTaskDeck({ event, onDismiss, onRefresh }: Props) {
  const meta = event.meta ?? {}
  const nextSteps = parseMeetingNextSteps(meta)
  const actions = parseMeetingActionsMeta(meta)
  const googleDocUrl = meta.googleDocUrl ? String(meta.googleDocUrl) : undefined
  const sessionId = meta.sessionId ? String(meta.sessionId) : undefined
  const [appendBusy, setAppendBusy] = useState(false)
  const [appendMsg, setAppendMsg] = useState<string | null>(null)

  const meetingApprovals = useMeetingActionApprovals(event, onRefresh)
  const pendingCount = meetingApprovals.ready ? meetingApprovals.pendingCount : 0
  const { heading, when } = postCallHeadings(event)
  const summary = summaryLine(event.body)
  const hasLinks = Boolean(googleDocUrl || sessionId)
  const hasActions = Boolean(actions && actions.proposedActions.length > 0)

  const appendSummary = async () => {
    if (!sessionId || appendBusy) return
    setAppendBusy(true)
    setAppendMsg(null)
    try {
      const result = await captureApi.appendMeeting(sessionId, { mode: 'summary' })
      setAppendMsg(result.ok ? 'Saved to capture' : 'Partial save — check Notes settings')
    } catch (err) {
      setAppendMsg(String(err))
    } finally {
      setAppendBusy(false)
    }
  }

  return (
    <article className="x-post-call-deck x-post-call-deck-ios">
      <header className="x-post-call-nav">
        <div className="x-post-call-nav-main">
          {heading !== 'Call wrap-up' ? (
            <p className="x-post-call-nav-eyebrow">Call wrap-up</p>
          ) : null}
          <h1 className="x-post-call-nav-title">{heading}</h1>
          {when ? <p className="x-post-call-nav-sub">{when}</p> : null}
        </div>
        {onDismiss ? (
          <button type="button" className="x-post-call-done" onClick={onDismiss}>
            Done
          </button>
        ) : null}
      </header>

      <div className="x-post-call-groups">
        {summary ? (
          <section className="x-post-call-section" aria-labelledby="x-post-call-summary-heading">
            <h2 id="x-post-call-summary-heading" className="x-post-call-section-label">
              Summary
            </h2>
            <div className="x-post-call-group">
              <p className="x-post-call-summary-body">{summary}</p>
            </div>
          </section>
        ) : null}

        {nextSteps.length > 0 ? (
          <section className="x-post-call-section" aria-labelledby="x-post-call-steps-heading">
            <h2 id="x-post-call-steps-heading" className="x-post-call-section-label">
              Next steps
            </h2>
            <div className="x-post-call-group">
              <ul className="x-post-call-list">
                {nextSteps.slice(0, 5).map((step, i) => (
                  <li key={step} className={i > 0 ? 'x-post-call-row-divider' : undefined}>
                    <span className="x-post-call-row-text">{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {hasLinks ? (
          <section className="x-post-call-section" aria-label="Documents">
            <div className="x-post-call-group">
              {googleDocUrl ? (
                <button
                  type="button"
                  className="x-post-call-row x-post-call-row-btn"
                  onClick={() => openBrowserLink(googleDocUrl, { title: 'Meeting notes', source: 'gdocs' })}
                >
                  <span className="x-post-call-row-label">Notes</span>
                  <Chevron />
                </button>
              ) : null}
              {sessionId ? (
                <button
                  type="button"
                  className={`x-post-call-row x-post-call-row-btn${googleDocUrl ? ' x-post-call-row-divider' : ''}`}
                  disabled={appendBusy}
                  onClick={() => void appendSummary()}
                >
                  <span className="x-post-call-row-label">
                    {appendBusy ? 'Saving…' : 'Save to Capture'}
                  </span>
                  {!appendBusy ? <Chevron /> : null}
                </button>
              ) : null}
            </div>
            {appendMsg ? <p className="x-post-call-section-footnote">{appendMsg}</p> : null}
          </section>
        ) : null}

        {hasActions ? (
          <section className="x-post-call-section" aria-labelledby="x-post-call-actions-heading">
            <div className="x-post-call-section-bar">
              <h2 id="x-post-call-actions-heading" className="x-post-call-section-label x-post-call-section-label-inline">
                Actions
              </h2>
              {pendingCount > 1 ? (
                <MeetingActionRunAllButton
                  approvals={meetingApprovals}
                  tone="text"
                  className="x-post-call-run-all"
                />
              ) : pendingCount === 0 ? (
                <span className="x-post-call-actions-done">All done</span>
              ) : null}
            </div>
            <div className="x-post-call-group x-post-call-group-actions">
              <MeetingActionCards
                event={event}
                onRefresh={onRefresh}
                variant="simple"
                hideRunAll
                approvals={meetingApprovals}
              />
            </div>
          </section>
        ) : null}
      </div>
    </article>
  )
}
