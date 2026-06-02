import type { MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'
import { openMeeting } from '../lib/api'
import { IconGmail, IconLike, IconMonday, IconReply, IconRepost, IconShare, IconViews } from './Icons'

const AVATAR: Record<string, { bg: string; color: string; label: string }> = {
  notch: { bg: '#0f1419', color: '#fff', label: 'N' },
  meet: { bg: '#00897b', color: '#fff', label: '▶' },
  meeting: { bg: '#00897b', color: '#fff', label: '✦' },
  slack: { bg: '#611f69', color: '#fff', label: 'S' },
  x: { bg: '#111', color: '#fff', label: 'X' },
  discord: { bg: '#5865f2', color: '#fff', label: 'D' },
  github: { bg: '#24292f', color: '#fff', label: 'GH' },
  gdocs: { bg: '#4285F4', color: '#fff', label: 'Gd' },
  gong: { bg: '#7c3aed', color: '#fff', label: 'Go' },
  salesforce: { bg: '#0176d3', color: '#fff', label: 'SF' },
  build: { bg: '#f59e0b', color: '#fff', label: '⚡' },
  insight: { bg: '#536471', color: '#fff', label: '✦' }
}

function FeedAvatar({ source }: { source: string }) {
  if (source === 'gmail') {
    return (
      <div className="x-avatar x-avatar-gmail" aria-hidden>
        <IconGmail className="x-avatar-brand-icon" />
      </div>
    )
  }
  if (source === 'monday') {
    return (
      <div className="x-avatar x-avatar-monday" aria-hidden>
        <IconMonday className="x-avatar-brand-icon" />
      </div>
    )
  }
  const av = AVATAR[source] ?? AVATAR.insight
  return (
    <div className="x-avatar" style={{ background: av.bg, color: av.color }}>
      {av.label}
    </div>
  )
}

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

type Props = {
  event: CentralStreamEvent
  isNew?: boolean
  isContext?: boolean
  activeThreadId?: string | null
  onOpenWorkspace?: (event: CentralStreamEvent) => void
  onOpenInWork?: (itemId: string) => void
  onOpenThread?: (itemId: string, day?: string) => void
  onSelectContext?: (itemId: string) => void
}

function streamItemId(event: CentralStreamEvent): string {
  return String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))
}

function isActionable(event: CentralStreamEvent): boolean {
  return Boolean(
    event.joinable ||
      event.promptPreview ||
      event.kind === 'build_prompt' ||
      event.kind === 'action' ||
      event.highlight
  )
}

export function FeedPost({
  event,
  isNew,
  isContext,
  activeThreadId,
  onOpenWorkspace,
  onOpenInWork,
  onOpenThread,
  onSelectContext
}: Props) {
  const isMondayThread = event.source === 'monday' && event.meta?.grouped === 'true'
  const isGmailThread = event.source === 'gmail'
  const isThreadable = isMondayThread || isGmailThread
  const handle =
    isMondayThread
      ? 'Monday'
      : event.source === 'notch'
      ? 'Notch AI'
      : event.source === 'meet'
        ? 'Google Meet'
        : event.source === 'gmail' && event.meta?.accountEmail
          ? `Gmail · ${event.meta.accountEmail}`
          : event.source.charAt(0).toUpperCase() + event.source.slice(1)
  const threadCount = Number(event.meta?.threadCount ?? '0')
  const threadItemId = streamItemId(event)
  const threadDay = event.meta?.day ? String(event.meta.day) : undefined
  const threadTitle = isMondayThread ? event.title.trim() : event.title
  const threadActive = isThreadable && threadItemId && activeThreadId === threadItemId
  const parentTs = isMondayThread ? Number(event.meta?.parentTs ?? event.ts) : event.ts
  const latestUpdateAgo = isMondayThread ? timeAgo(event.ts) : ''

  const googleDocUrl =
    event.source === 'meeting' && event.meta?.googleDocUrl
      ? String(event.meta.googleDocUrl)
      : undefined
  const googleDocError =
    event.source === 'meeting' && event.meta?.googleDocError
      ? String(event.meta.googleDocError)
      : undefined

  const openThread = (e?: MouseEvent) => {
    e?.stopPropagation()
    if (threadItemId) onOpenThread?.(threadItemId, threadDay)
  }

  const selectContext = () => {
    onSelectContext?.(threadItemId)
  }

  const handlePostClick = () => {
    selectContext()
    if (isGmailThread && threadItemId) openThread()
  }

  return (
    <article
      className={`x-post ${isNew ? 'x-post-new' : ''} ${isContext ? 'x-post-context' : ''} ${isActionable(event) ? 'x-post-actionable' : ''} ${threadActive ? 'x-post-thread-active' : ''} ${isThreadable ? 'x-post-threadable' : ''}`}
      onClick={handlePostClick}
    >
      <FeedAvatar source={event.source} />
      <div className="x-post-content">
        <div className="x-post-head">
          <span className="x-name">{handle}</span>
          <span className="x-handle">@{event.source}</span>
          <span className="x-dot">·</span>
          <span className="x-time">{timeAgo(parentTs)}</span>
        </div>

        {threadTitle && event.kind !== 'transcript_live' && (
          <p className="x-post-title">{threadTitle}</p>
        )}
        <p className="x-post-body">{event.body}</p>

        {isMondayThread && threadCount > 0 && threadItemId && (
          <button type="button" className="x-thread-replies" onClick={openThread}>
            <span className="x-thread-replies-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path
                  fill="currentColor"
                  d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"
                />
              </svg>
            </span>
            <span className="x-thread-replies-text">
              {threadCount} {threadCount === 1 ? 'update' : 'updates'}
            </span>
            {latestUpdateAgo && (
              <span className="x-thread-replies-meta">Last activity {latestUpdateAgo} ago</span>
            )}
          </button>
        )}

        {isGmailThread && threadItemId && (
          <button type="button" className="x-thread-replies" onClick={openThread}>
            <span className="x-thread-replies-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path
                  fill="currentColor"
                  d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"
                />
              </svg>
            </span>
            <span className="x-thread-replies-text">
              {threadCount > 0
                ? `${threadCount + 1} messages`
                : 'Open thread'}
            </span>
          </button>
        )}

        {googleDocUrl ? (
          <button
            type="button"
            className="x-action-btn x-action-btn-primary x-meeting-doc-btn"
            onClick={(e) => {
              e.stopPropagation()
              window.notchDesktop?.openExternal?.(googleDocUrl)
            }}
          >
            Open Google Doc
          </button>
        ) : null}

        {googleDocError && !googleDocUrl ? (
          <p className="x-int-alert x-meeting-doc-error">{googleDocError}</p>
        ) : null}

        {event.source === 'meeting' &&
        parseMeetingActionsMeta(event.meta)?.proposedActions.length &&
        onOpenInWork ? (
          <button
            type="button"
            className="x-action-btn x-meeting-work-link"
            onClick={(e) => {
              e.stopPropagation()
              onOpenInWork(threadItemId)
            }}
          >
            Review post-call tasks in Work →
          </button>
        ) : null}

        {event.joinable && event.meetingLink && (
          <div className="x-action-card x-action-card-meet">
            <div className="x-meet-thumb">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="#00897b"
                  d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"
                />
              </svg>
            </div>
            <div className="x-meet-info">
              <p className="x-meet-title">{event.title}</p>
              <p className="x-meet-sub">
                {event.body || 'Google Meet'}
                {event.meta?.duration ? ` · ${event.meta.duration}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="x-action-btn x-action-btn-primary"
              onClick={(e) => {
                e.stopPropagation()
                openMeeting(event.meetingLink!, event.title)
              }}
            >
              Join Meet
            </button>
          </div>
        )}

        {event.promptPreview && (
          <div className="x-prompt">
            <span className="x-prompt-label">Agent prompt</span>
            <code>{event.promptPreview}</code>
          </div>
        )}

        <div className="x-actions">
          <button
            type="button"
            className="x-action"
            aria-label={isThreadable ? 'Open thread' : 'Open tab'}
            onClick={(e) => {
              e.stopPropagation()
              if (isThreadable && threadItemId) openThread(e)
              else onOpenWorkspace?.(event)
            }}
          >
            {isThreadable ? 'Open thread' : 'Open tab'}
          </button>
          <button
            type="button"
            className="x-action"
            aria-label="Reply"
            onClick={(e) => {
              e.stopPropagation()
              selectContext()
              if (isThreadable && threadItemId) openThread(e)
            }}
          >
            <IconReply className="x-action-icon" />
          </button>
          {!isMondayThread && (
            <>
              <button type="button" className="x-action" aria-label="Repost" onClick={(e) => e.stopPropagation()}>
                <IconRepost className="x-action-icon" />
              </button>
              <button type="button" className="x-action" aria-label="Like" onClick={(e) => e.stopPropagation()}>
                <IconLike className="x-action-icon" />
              </button>
              <button type="button" className="x-action" aria-label="Views" onClick={(e) => e.stopPropagation()}>
                <IconViews className="x-action-icon" />
              </button>
            </>
          )}
          <button type="button" className="x-action x-action-share" aria-label="Share" onClick={(e) => e.stopPropagation()}>
            <IconShare className="x-action-icon" />
          </button>
        </div>
      </div>
    </article>
  )
}
