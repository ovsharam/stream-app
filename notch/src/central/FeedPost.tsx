import { useState, useRef, useEffect, type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import { parseMeetingActionsMeta } from '@shared/meeting-actions'
import { parseAgentProposalFeedMeta } from '@shared/agent-proposal-ui'
import { openBrowserLink, openMeeting } from '../lib/api'
import { trackOperatorEvent } from '../lib/operatorTelemetry'
import { feedEventBrowseUrl } from './workspace'
import { getFeedVote, setFeedVote } from './feedFeedbackStore'
import { AgentProposalFeedCard } from './AgentProposalFeedCard'
import { GmailCalendarInviteCard, isCalendarInviteEvent } from './GmailCalendarInviteCard'
import { IconGmail, IconLinkedin, IconMonday, IconReply, IconRepost, IconShare, IconViews } from './Icons'

const AVATAR: Record<string, { bg: string; color: string; label: string }> = {
  notch: { bg: '#181715', color: '#cc785c', label: 'N' },
  linkedin: { bg: '#0a66c2', color: '#fff', label: 'in' },
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

type AttachmentMeta = {
  type: 'file' | 'image' | 'link'
  name: string
  url?: string
  mimeType?: string
}

type MetricsMeta = {
  like_count?: number
  retweet_count?: number
  reply_count?: number
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key]
  if (v == null || v === '') return undefined
  return String(v)
}

const PROMPT_COLLAPSE_CHARS = 160

function isCursorFeedEvent(event: CentralStreamEvent): boolean {
  return (
    event.source === 'cursor' ||
    event.source === 'claude' ||
    event.kind === 'build_prompt' ||
    (event.source === 'insight' && (event.meta?.source === 'cursor' || event.meta?.source === 'claude'))
  )
}

function splitCursorFeedContent(event: CentralStreamEvent): { status?: string; prompt?: string } {
  const promptFromMeta = event.promptPreview || metaStr(event.meta, 'query')
  let body = event.body?.trim() ?? ''
  const title = event.title?.trim() ?? ''

  const marker = body.search(/\n+Prompt:\s*/i)
  if (marker >= 0) {
    const status = body.slice(0, marker).trim()
    const embedded = body.slice(marker).replace(/^\n+Prompt:\s*/i, '').trim()
    return { status, prompt: embedded || promptFromMeta || title }
  }

  if (promptFromMeta && promptFromMeta !== body) {
    return { status: body || undefined, prompt: promptFromMeta }
  }

  if (title.length > PROMPT_COLLAPSE_CHARS && body && body !== title) {
    return { status: body, prompt: title }
  }

  if (title.length > PROMPT_COLLAPSE_CHARS && (!body || body === title)) {
    return { prompt: title }
  }

  return { status: body || title || undefined }
}

function CursorFeedCard({ event }: { event: CentralStreamEvent }) {
  const { status, prompt } = splitCursorFeedContent(event)

  return (
    <>
      {event.highlight ? <span className="x-card-highlight">{event.highlight}</span> : null}
      {status ? <p className="x-post-body">{status}</p> : null}
      {prompt ? <CollapsiblePrompt text={prompt} /> : null}
    </>
  )
}

function CollapsiblePrompt({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > PROMPT_COLLAPSE_CHARS

  if (!long) {
    return (
      <div className="x-prompt">
        <span className="x-prompt-label">Agent prompt</span>
        <code>{text}</code>
      </div>
    )
  }

  return (
    <div className={`x-prompt${open ? ' x-prompt-open' : ' x-prompt-collapsed'}`}>
      <button
        type="button"
        className="x-prompt-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <span className="x-prompt-label">Agent prompt</span>
        <span className="x-prompt-hint">{open ? 'Collapse' : `Expand · ${text.length} chars`}</span>
      </button>
      {open ? (
        <code>{text}</code>
      ) : (
        <p className="x-prompt-teaser">{text.slice(0, PROMPT_COLLAPSE_CHARS)}…</p>
      )}
    </div>
  )
}

function metaJson<T>(meta: Record<string, unknown> | undefined, key: string): T | undefined {
  const raw = meta?.[key]
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }
  if (raw && typeof raw === 'object') return raw as T
  return undefined
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
  if (source === 'linkedin') {
    return (
      <div className="x-avatar x-avatar-linkedin" aria-hidden>
        <IconLinkedin className="x-avatar-brand-icon" />
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
  const diffMs = Date.now() - ts
  if (diffMs < 0) {
    const futureMin = Math.ceil(-diffMs / 60_000)
    if (futureMin < 60) return `in ${futureMin}m`
    const futureHours = Math.ceil(-diffMs / 3_600_000)
    if (futureHours < 48) return `in ${futureHours}h`
    const futureDays = Math.ceil(-diffMs / 86_400_000)
    return `in ${futureDays}d`
  }
  const m = Math.floor(diffMs / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

function feedTimeLabel(event: CentralStreamEvent, ts: number): string {
  const source = metaStr(event.meta, 'source') ?? event.source
  if (source === 'calcom') {
    const startRaw = metaStr(event.meta, 'startTime')
    if (startRaw) {
      const startMs = new Date(startRaw).getTime()
      if (!Number.isNaN(startMs) && startMs > Date.now() + 60_000) {
        return timeAgo(startMs)
      }
    }
  }
  return timeAgo(ts)
}


function LinkPreview({
  url,
  title,
  onClick
}: {
  url: string
  title?: string
  onClick: (e: MouseEvent) => void
}) {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    /* keep raw url */
  }
  const imageAttachment = url.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)

  return (
    <button type="button" className="x-card-link-preview" onClick={onClick}>
      {imageAttachment ? (
        <img className="x-card-link-preview-thumb" src={url} alt="" loading="lazy" />
      ) : (
        <div className="x-card-link-preview-thumb" aria-hidden>
          🔗
        </div>
      )}
      <div className="x-card-link-preview-body">
        <p className="x-card-link-preview-title">{title ?? host}</p>
        <p className="x-card-link-preview-url">{host}</p>
      </div>
    </button>
  )
}

function AttachmentChips({ attachments }: { attachments: AttachmentMeta[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="x-card-row">
      {attachments.slice(0, 3).map((a, i) => (
        <span key={`${a.name}-${i}`} className="x-card-attachment">
          {a.type === 'image' ? '🖼' : a.type === 'link' ? '🔗' : '📎'} {a.name}
        </span>
      ))}
    </div>
  )
}

function EngagementHints({ metrics }: { metrics?: MetricsMeta }) {
  if (!metrics) return null
  const likes = metrics.like_count ?? 0
  const reposts = metrics.retweet_count ?? 0
  const replies = metrics.reply_count ?? 0
  if (likes + reposts + replies === 0) return null
  return (
    <div className="x-card-engagement">
      {replies > 0 ? <span>💬 {replies}</span> : null}
      {reposts > 0 ? <span>🔁 {reposts}</span> : null}
      {likes > 0 ? <span>♥ {likes}</span> : null}
    </div>
  )
}

function GmailCard({ event }: { event: CentralStreamEvent }) {
  if (isCalendarInviteEvent(event)) {
    return <GmailCalendarInviteCard event={event} />
  }

  const subject = metaStr(event.meta, 'subject') ?? event.title
  const attachments = metaJson<AttachmentMeta[]>(event.meta, 'attachments') ?? []

  return (
    <>
      {subject ? <p className="x-post-title x-post-title-inline">{subject}</p> : null}
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
      <AttachmentChips attachments={attachments} />
    </>
  )
}

function ChatCard({ event, channelLabel }: { event: CentralStreamEvent; channelLabel?: string }) {
  const replyCount = Number(metaStr(event.meta, 'replyCount') ?? '0')
  const channel =
    channelLabel ??
    (event.title.startsWith('#') ? event.title : metaStr(event.meta, 'channelName') ? `#${metaStr(event.meta, 'channelName')}` : undefined)

  return (
    <>
      <div className="x-card-row x-card-row-tight">
        {channel ? <span className="x-card-channel">{channel}</span> : null}
        {replyCount > 0 ? <span className="x-card-meta-line">{replyCount} replies</span> : null}
      </div>
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
    </>
  )
}

function GithubCard({ event }: { event: CentralStreamEvent }) {
  const repo = metaStr(event.meta, 'repo')
  const issueNumber = metaStr(event.meta, 'issueNumber')
  const title = event.title.replace(/^#\d+\s*/, '')

  return (
    <>
      <div className="x-card-row x-card-row-tight">
        {repo ? <span className="x-card-repo">{repo}</span> : null}
        {issueNumber ? <span className="x-card-issue-badge">#{issueNumber}</span> : null}
      </div>
      <p className="x-post-title x-post-title-inline">{title}</p>
      {event.body && event.body !== title ? <p className="x-post-body">{event.body}</p> : null}
    </>
  )
}

function MondayCard({ event }: { event: CentralStreamEvent }) {
  const board = metaStr(event.meta, 'boardName')
  return (
    <>
      {board ? <span className="x-card-channel">{board}</span> : null}
      {event.title ? <p className="x-post-title x-post-title-inline">{event.title}</p> : null}
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
    </>
  )
}

function GdocsCard({ event }: { event: CentralStreamEvent }) {
  return (
    <>
      <p className="x-post-title x-post-title-inline">{event.title}</p>
      {event.body && event.body !== event.title ? (
        <p className="x-post-body">{event.body}</p>
      ) : null}
    </>
  )
}

function PostInlineActions({
  items
}: {
  items: { label: string; onClick: (e: MouseEvent) => void }[]
}) {
  if (items.length === 0) return null
  return (
    <div className="x-post-cta-row">
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          className={`x-post-cta ${index === 0 ? 'x-post-cta-primary' : 'x-post-cta-secondary'}`}
          onClick={item.onClick}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function XCard({ event }: { event: CentralStreamEvent }) {
  const metrics = metaJson<MetricsMeta>(event.meta, 'metrics')

  return (
    <>
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
      <EngagementHints metrics={metrics} />
    </>
  )
}

function MeetingCard({ event }: { event: CentralStreamEvent }) {
  const durationSec = metaStr(event.meta, 'durationSec')
  const durationMin = durationSec ? Math.round(Number(durationSec) / 60) : undefined
  const isLive = event.kind === 'transcript_live'

  return (
    <>
      <div className="x-card-row x-card-row-tight">
        {isLive ? (
          <span className="x-card-live-badge">
            <span className="x-card-live-dot" aria-hidden />
            Live
          </span>
        ) : null}
        {durationMin ? <span className="x-card-meta-line">{durationMin} min</span> : null}
      </div>
      {event.title && !isLive ? <p className="x-post-title x-post-title-inline">{event.title}</p> : null}
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
    </>
  )
}

function GongCard({ event }: { event: CentralStreamEvent }) {
  const durationSec = metaStr(event.meta, 'durationSec')
  const durationMin = durationSec ? Math.round(Number(durationSec) / 60) : undefined

  return (
    <>
      {event.title ? <p className="x-post-title x-post-title-inline">{event.title}</p> : null}
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
      {durationMin ? <p className="x-card-meta-line">{durationMin} min</p> : null}
    </>
  )
}

function GenericCard({ event }: { event: CentralStreamEvent }) {
  return (
    <>
      {event.highlight ? <span className="x-card-highlight">{event.highlight}</span> : null}
      {event.title && event.kind !== 'transcript_live' ? (
        <p className="x-post-title x-post-title-inline">{event.title}</p>
      ) : null}
      {event.body ? <p className="x-post-body">{event.body}</p> : null}
    </>
  )
}

function SourceCardBody({ event }: { event: CentralStreamEvent }) {
  if (isCursorFeedEvent(event)) {
    return <CursorFeedCard event={event} />
  }

  switch (event.source) {
    case 'gmail':
      return <GmailCard event={event} />
    case 'slack':
    case 'discord':
      return <ChatCard event={event} channelLabel={event.title.startsWith('#') ? event.title : undefined} />
    case 'github':
      return <GithubCard event={event} />
    case 'monday':
      return <MondayCard event={event} />
    case 'gdocs':
      return <GdocsCard event={event} />
    case 'x':
      return <XCard event={event} />
    case 'linkedin':
      if (parseAgentProposalFeedMeta(event.meta, event)) {
        return null
      }
      return <GenericCard event={event} />
    case 'notch':
      if (event.kind === 'transcript_live' || event.kind === 'transcript_done') {
        return <MeetingCard event={event} />
      }
      return <GenericCard event={event} />
    case 'meeting':
      return <MeetingCard event={event} />
    case 'gong':
      return <GongCard event={event} />
    case 'meet':
      return null
    default:
      return <GenericCard event={event} />
  }
}

type Props = {
  event: CentralStreamEvent
  variant?: 'default' | 'rail'
  surface?: 'feed' | 'stream_rail'
  isNew?: boolean
  isContext?: boolean
  activeThreadId?: string | null
  onOpenWorkspace?: (event: CentralStreamEvent) => void
  onOpenInWork?: (itemId: string) => void
  onOpenThread?: (itemId: string, day?: string) => void
  onSelectContext?: (itemId: string) => void
  onRefresh?: () => void
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
      parseAgentProposalFeedMeta(event.meta, event) ||
      event.highlight
  )
}

function PostActions({
  event,
  itemId,
  surface,
  isMondayThread,
  isThreadable,
  threadItemId,
  openThread,
  selectContext,
  onOpenWorkspace
}: {
  event: CentralStreamEvent
  itemId: string
  surface: string
  isMondayThread: boolean
  isThreadable: boolean
  threadItemId: string
  openThread: (e?: MouseEvent) => void
  selectContext: () => void
  onOpenWorkspace?: (event: CentralStreamEvent) => void
}) {
  const [vote, setVote] = useState(() => getFeedVote(event.id))

  const toggleVote = (e: MouseEvent, next: 'up' | 'down') => {
    e.stopPropagation()
    const prev = vote
    const result = setFeedVote(event.id, next)
    setVote(result)
    trackOperatorEvent(
      'feed_vote',
      {
        eventId: event.id,
        source: event.source,
        itemId,
        vote: result ?? 'clear',
        previousVote: prev
      },
      { surface, subjectType: 'stream_item', subjectId: itemId }
    )
  }

  return (
    <div className="x-actions">
      <button
        type="button"
        className="x-action"
        aria-label={isThreadable ? 'Open thread' : 'Reply'}
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
          <button
            type="button"
            className={`x-action x-action-vote${vote === 'up' ? ' x-action-vote-active' : ''}`}
            aria-label="Helpful"
            aria-pressed={vote === 'up'}
            onClick={(e) => toggleVote(e, 'up')}
          >
            <span className="x-action-vote-glyph" aria-hidden>
              ▲
            </span>
          </button>
          <button
            type="button"
            className={`x-action x-action-vote x-action-vote-down${vote === 'down' ? ' x-action-vote-active' : ''}`}
            aria-label="Not helpful"
            aria-pressed={vote === 'down'}
            onClick={(e) => toggleVote(e, 'down')}
          >
            <span className="x-action-vote-glyph" aria-hidden>
              ▼
            </span>
          </button>
          <button type="button" className="x-action" aria-label="Views" onClick={(e) => e.stopPropagation()}>
            <IconViews className="x-action-icon" />
          </button>
        </>
      )}
      <button
        type="button"
        className="x-action x-action-share"
        aria-label={isThreadable ? 'Open thread' : 'Open'}
        onClick={(e) => {
          e.stopPropagation()
          if (isThreadable && threadItemId) openThread(e)
          else onOpenWorkspace?.(event)
        }}
      >
        <IconShare className="x-action-icon" />
      </button>
    </div>
  )
}

export function FeedPost({
  event,
  variant = 'default',
  surface: surfaceProp,
  isNew,
  isContext,
  activeThreadId,
  onOpenWorkspace,
  onOpenInWork,
  onOpenThread,
  onSelectContext,
  onRefresh
}: Props) {
  const surface = surfaceProp ?? (variant === 'rail' ? 'stream_rail' : 'feed')
  const postRef = useRef<HTMLElement>(null)
  const impressedRef = useRef(false)
  const visibleSinceRef = useRef<number | null>(null)

  useEffect(() => {
    const el = postRef.current
    if (!el) return

    const itemId = streamItemId(event)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!impressedRef.current) {
              impressedRef.current = true
              trackOperatorEvent(
                'feed_impression',
                { eventId: event.id, source: event.source, itemId },
                { surface, subjectType: 'stream_item', subjectId: itemId }
              )
            }
            if (visibleSinceRef.current == null) visibleSinceRef.current = Date.now()
          } else if (visibleSinceRef.current != null) {
            const durationMs = Date.now() - visibleSinceRef.current
            visibleSinceRef.current = null
            if (durationMs >= 250) {
              trackOperatorEvent(
                'feed_dwell',
                { eventId: event.id, source: event.source, itemId, durationMs },
                { surface, subjectType: 'stream_item', subjectId: itemId }
              )
            }
          }
        }
      },
      { threshold: 0.35 }
    )

    observer.observe(el)
    return () => {
      if (visibleSinceRef.current != null) {
        const durationMs = Date.now() - visibleSinceRef.current
        if (durationMs >= 250) {
          trackOperatorEvent(
            'feed_dwell',
            { eventId: event.id, source: event.source, itemId, durationMs },
            { surface, subjectType: 'stream_item', subjectId: itemId }
          )
        }
      }
      observer.disconnect()
    }
  }, [event.id, event.source, surface])

  const isMondayThread = event.source === 'monday' && event.meta?.grouped === 'true'
  const isGmailThread = event.source === 'gmail'
  const isThreadable = isMondayThread || isGmailThread
  const isAgentLinkedIn = Boolean(parseAgentProposalFeedMeta(event.meta, event))
  const isCursorFeed = isCursorFeedEvent(event)
  const handle =
    isCursorFeed
      ? event.meta?.executor === 'claude-code' || event.source === 'claude'
        ? 'Claude Code'
        : 'Cursor'
      : isMondayThread
      ? 'Monday'
      : event.source === 'linkedin'
        ? metaStr(event.meta, 'senderName') || event.title.trim() || 'LinkedIn'
        : event.source === 'notch'
          ? 'Notch AI'
          : event.source === 'meet'
            ? 'Google Meet'
            : event.source === 'gmail'
              ? metaStr(event.meta, 'sender') ?? 'Gmail'
              : event.source === 'x' && metaStr(event.meta, 'sender')
                ? metaStr(event.meta, 'sender')!
                : metaStr(event.meta, 'sender') ?? event.source.charAt(0).toUpperCase() + event.source.slice(1)
  const threadCount = Number(event.meta?.threadCount ?? '0')
  const threadItemId = streamItemId(event)
  const threadDay = event.meta?.day ? String(event.meta.day) : undefined
  const threadTitle = isMondayThread ? event.title.trim() : event.title
  const threadActive = isThreadable && threadItemId && activeThreadId === threadItemId
  const parentTs = isMondayThread ? Number(event.meta?.parentTs ?? event.ts) : event.ts
  const linkUrl = metaStr(event.meta, 'url')
  const attachments = metaJson<AttachmentMeta[]>(event.meta, 'attachments') ?? []
  const imageUrl = attachments.find((a) => a.type === 'image' && a.url)?.url ?? linkUrl

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
    if (threadItemId) {
      trackOperatorEvent(
        'feed_thread_open',
        { itemId: threadItemId, source: event.source, day: threadDay },
        { surface, subjectType: 'stream_item', subjectId: threadItemId }
      )
      onOpenThread?.(threadItemId, threadDay)
    }
  }

  const selectContext = () => {
    onSelectContext?.(threadItemId)
  }

  const handlePostClick = () => {
    selectContext()
    if (feedEventBrowseUrl(event)) {
      onOpenWorkspace?.(event)
      return
    }
    if (isGmailThread && threadItemId) openThread()
  }

  const openLink = (e: MouseEvent, url: string, title?: string) => {
    e.stopPropagation()
    openBrowserLink(url, { title })
  }

  const hideTitle =
    event.kind === 'transcript_live' ||
    ['gmail', 'github', 'gdocs', 'x', 'slack', 'discord', 'meeting', 'linkedin'].includes(event.source) ||
    isMondayThread ||
    isAgentLinkedIn ||
    isCursorFeed
  const hasBrowseTarget = Boolean(feedEventBrowseUrl(event))

  const inlineActions: { label: string; onClick: (e: MouseEvent) => void }[] = []
  if (googleDocUrl) {
    inlineActions.push({
      label: 'Open notes',
      onClick: (e) => openLink(e, googleDocUrl, 'Meeting notes')
    })
  } else if (event.source === 'gdocs' && linkUrl?.startsWith('http')) {
    inlineActions.push({
      label: 'Open doc',
      onClick: (e) => openLink(e, linkUrl, event.title || 'Google Doc')
    })
  }
  if (
    event.source === 'meeting' &&
    parseMeetingActionsMeta(event.meta)?.proposedActions.length &&
    onOpenInWork
  ) {
    inlineActions.push({
      label: 'Review tasks',
      onClick: (e) => {
        e.stopPropagation()
        onOpenInWork(threadItemId)
      }
    })
  }

  return (
    <article
      ref={postRef}
      className={`x-post x-post-${event.source}${variant === 'rail' ? ' x-post-rail' : ''} ${isNew ? 'x-post-new' : ''} ${isContext ? 'x-post-context' : ''} ${isActionable(event) ? 'x-post-actionable' : ''} ${threadActive ? 'x-post-thread-active' : ''} ${isThreadable ? 'x-post-threadable' : ''}${hasBrowseTarget ? ' x-post-browseable' : ''}`}
      onClick={handlePostClick}
    >
      <FeedAvatar source={event.source} />
      <div className="x-post-content">
        <div className="x-post-head">
          <span className="x-name">{handle}</span>
          {event.source === 'linkedin' ? (
            <>
              <span className="x-dot">·</span>
              <span className="x-post-channel">LinkedIn</span>
            </>
          ) : null}
          <span className="x-dot">·</span>
          <span className="x-time">{feedTimeLabel(event, parentTs)}</span>
          {isMondayThread && threadCount > 0 ? (
            <>
              <span className="x-dot">·</span>
              <button type="button" className="x-post-thread-link" onClick={openThread}>
                {threadCount} {threadCount === 1 ? 'update' : 'updates'}
              </button>
            </>
          ) : null}
          {isGmailThread && threadCount > 0 ? (
            <>
              <span className="x-dot">·</span>
              <button type="button" className="x-post-thread-link" onClick={openThread}>
                {threadCount + 1} msgs
              </button>
            </>
          ) : null}
        </div>

        {threadTitle && !hideTitle ? <p className="x-post-title">{threadTitle}</p> : null}

        {event.source !== 'meet' ? <SourceCardBody event={event} /> : null}

        {linkUrl && !['gdocs', 'github', 'meet'].includes(event.source) ? (
          <LinkPreview
            url={imageUrl && imageUrl.match(/\.(png|jpe?g|gif|webp)/i) ? imageUrl : linkUrl}
            title={event.title}
            onClick={(e) => openLink(e, linkUrl)}
          />
        ) : null}

        {googleDocError && !googleDocUrl ? (
          <p className="x-post-note x-post-note-error">{googleDocError}</p>
        ) : null}

        <PostInlineActions items={inlineActions} />

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

        {event.promptPreview && !isCursorFeed ? <CollapsiblePrompt text={event.promptPreview} /> : null}

        {parseAgentProposalFeedMeta(event.meta, event) ? (
          <AgentProposalFeedCard event={event} onRefresh={onRefresh} />
        ) : null}

        <PostActions
          event={event}
          itemId={threadItemId}
          surface={surface}
          isMondayThread={isMondayThread}
          isThreadable={isThreadable}
          threadItemId={threadItemId}
          openThread={openThread}
          selectContext={selectContext}
          onOpenWorkspace={onOpenWorkspace}
        />
      </div>
    </article>
  )
}
