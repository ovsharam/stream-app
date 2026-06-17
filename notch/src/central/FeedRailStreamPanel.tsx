import { useMemo, useState } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { ComposeMentionTarget } from '@shared/compose'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'
import { parseAgentProposalFeedMeta } from '@shared/agent-proposal-ui'
import { ComposeInput } from './ComposeInput'
import { FeedPost } from './FeedPost'

type Filter = 'action' | 'all'

type Props = {
  events: CentralStreamEvent[]
  live?: boolean
  activeThreadId?: string | null
  contextItemId?: string | null
  onOpenThread?: (itemId: string, day?: string) => void
  onOpenInWork?: (itemId: string) => void
  onOpenWorkspace?: (event: CentralStreamEvent) => void
  onSelectContext?: (itemId: string) => void
  onRefresh?: () => void
  compose: string
  onComposeChange: (value: string) => void
  onSubmitCompose: () => void
  composeBusy?: boolean
  composeAction?: { provider: string; intent?: string } | null
  composeToast?: string | null
  composeError?: string | null
  mentionTargets?: ComposeMentionTarget[]
  contextLabel?: string | null
  mondayContext?: boolean
  onClearContext?: () => void
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function needsAction(event: CentralStreamEvent): boolean {
  if (event.joinable || event.promptPreview || event.kind === 'build_prompt' || event.kind === 'action') {
    return true
  }
  if (parseAgentProposalFeedMeta(event.meta, event)) return true
  if (event.source === 'meeting' && parseMeetingActionsMeta(event.meta)?.proposedActions.length) {
    return true
  }
  return Boolean(event.highlight)
}

export function FeedRailStreamPanel({
  events,
  live = false,
  activeThreadId,
  contextItemId,
  onOpenThread,
  onOpenInWork,
  onOpenWorkspace,
  onSelectContext,
  onRefresh,
  compose,
  onComposeChange,
  onSubmitCompose,
  composeBusy = false,
  composeAction = null,
  composeToast,
  composeError,
  mentionTargets = [],
  contextLabel,
  mondayContext = false,
  onClearContext
}: Props) {
  const [filter, setFilter] = useState<Filter>('action')

  const visible = useMemo(() => {
    const list = filter === 'action' ? events.filter(needsAction) : events
    return list.slice(0, 40)
  }, [events, filter])

  const actionCount = useMemo(() => events.filter(needsAction).length, [events])

  const composePlaceholder = mondayContext
    ? '@monday: comment or move to Done · @monday create: new ticket'
    : '@cal.com book appointment · @mind · @gmail · @slack · @monday'

  return (
    <div className="x-rail-feed">
      <div className="x-rail-feed-compose">
        {contextLabel ? (
          <div className="x-rail-feed-compose-context">
            <span>
              {mondayContext ? 'Updating Monday item:' : 'Replying to:'} {contextLabel}
            </span>
            {onClearContext ? (
              <button
                type="button"
                className="x-rail-feed-compose-context-clear"
                onClick={onClearContext}
                aria-label="Clear reply context"
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        {composeToast ? <p className="x-rail-feed-compose-toast">{composeToast}</p> : null}
        {composeError ? (
          <p className="x-rail-feed-compose-error">{composeError}</p>
        ) : null}
        <ComposeInput
          value={compose}
          onChange={onComposeChange}
          onSubmit={onSubmitCompose}
          mentionTargets={mentionTargets}
          placeholder={composePlaceholder}
          rows={2}
          className="x-rail-feed-compose-input"
        />
        <div className="x-rail-feed-compose-toolbar">
          <button
            type="button"
            className="x-rail-feed-compose-submit"
            disabled={!composeAction || composeBusy}
            onClick={onSubmitCompose}
          >
            {composeBusy
              ? 'Running…'
              : composeAction?.provider === 'meet'
                ? 'Schedule Meet'
                : composeAction
                  ? 'Run action'
                  : 'Post'}
          </button>
        </div>
      </div>
      <div className="x-rail-feed-head">
        <p className="x-rail-feed-lede">Act on feed items without leaving your app.</p>
        <div className="x-rail-feed-filters" role="tablist" aria-label="Stream filter">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'action'}
            className={`x-rail-feed-filter${filter === 'action' ? ' active' : ''}`}
            onClick={() => setFilter('action')}
          >
            Action{actionCount > 0 ? ` (${actionCount})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`x-rail-feed-filter${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>
      <div className="x-rail-feed-list">
        {visible.length === 0 ? (
          <p className="x-rail-feed-empty">
            {filter === 'action' ? 'Nothing needs action right now.' : 'Your stream is quiet.'}
          </p>
        ) : (
          visible.map((event, i) => {
            const itemId = streamItemId(event)
            return (
              <FeedPost
                key={event.id}
                variant="rail"
                surface="stream_rail"
                event={event}
                isNew={live && i === 0}
                isContext={contextItemId === itemId}
                activeThreadId={activeThreadId}
                onOpenWorkspace={onOpenWorkspace}
                onOpenInWork={onOpenInWork}
                onOpenThread={onOpenThread}
                onSelectContext={onSelectContext}
                onRefresh={onRefresh}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
