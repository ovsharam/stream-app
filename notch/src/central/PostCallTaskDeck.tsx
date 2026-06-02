import type { CentralStreamEvent } from '@shared/cluster'
import { parseMeetingActionsMeta, parseMeetingNextSteps } from '@shared/meeting-actions'
import { MeetingActionCards } from './MeetingActionCards'

type Props = {
  event: CentralStreamEvent
  onDismiss?: () => void
  onRefresh?: () => void
}

function scopeMeta(decision?: string): { label: string; hint: string; className: string } {
  if (decision === 'quick_win') {
    return {
      label: 'Quick win',
      hint: '1–4 week engagement · SMB / new feature bundle',
      className: 'x-scope-badge x-scope-quick'
    }
  }
  if (decision === 'big_bet') {
    return {
      label: 'Big bet',
      hint: '5+ week engagement · strategic existing client',
      className: 'x-scope-badge x-scope-big'
    }
  }
  return {
    label: 'Scope TBD',
    hint: 'Confirm quick-win vs big-bet before routing builds',
    className: 'x-scope-badge x-scope-unknown'
  }
}

export function PostCallTaskDeck({ event, onDismiss, onRefresh }: Props) {
  const meta = event.meta ?? {}
  const scope = scopeMeta(meta.scopeDecision ? String(meta.scopeDecision) : undefined)
  const nextSteps = parseMeetingNextSteps(meta)
  const actions = parseMeetingActionsMeta(meta)
  const googleDocUrl = meta.googleDocUrl ? String(meta.googleDocUrl) : undefined
  const googleDocError = meta.googleDocError ? String(meta.googleDocError) : undefined

  const pendingCount =
    actions?.proposedActions.filter((p) => !actions.approvedActions?.[p.id]?.ok).length ?? 0

  return (
    <div className="x-post-call-deck">
      <header className="x-post-call-head">
        <div className="x-post-call-head-main">
          <p className="x-post-call-eyebrow">Post-call · route tasks</p>
          <h1 className="x-post-call-title">{event.title.replace(/^Meeting ·\s*/i, '')}</h1>
          <div className={scope.className}>
            <span className="x-scope-badge-label">{scope.label}</span>
            <span className="x-scope-badge-hint">{scope.hint}</span>
          </div>
        </div>
        {onDismiss ? (
          <button type="button" className="x-post-call-dismiss" onClick={onDismiss}>
            Done
          </button>
        ) : null}
      </header>

      <section className="x-post-call-summary">
        <p className="x-post-call-body">{event.body}</p>
        {nextSteps.length > 0 ? (
          <ul className="x-post-call-steps">
            {nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="x-post-call-doc-row">
        {googleDocUrl ? (
          <button
            type="button"
            className="x-action-btn x-action-btn-primary"
            onClick={() => window.notchDesktop?.openExternal?.(googleDocUrl)}
          >
            Open Google Doc
          </button>
        ) : null}
        {googleDocError && !googleDocUrl ? (
          <p className="x-int-alert">{googleDocError}</p>
        ) : null}
        {pendingCount > 0 ? (
          <p className="x-post-call-pending">{pendingCount} action(s) awaiting approval</p>
        ) : actions?.proposedActions.length ? (
          <p className="x-post-call-pending x-post-call-pending-done">All actions routed</p>
        ) : null}
      </div>

      <MeetingActionCards event={event} onRefresh={onRefresh} variant="deck" />
    </div>
  )
}
