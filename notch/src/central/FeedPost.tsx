import type { CentralStreamEvent } from '@shared/cluster'
import { openMeeting } from '../lib/api'

const AVATAR: Record<string, { bg: string; color: string; label: string }> = {
  notch: { bg: '#e8f5e9', color: '#2e7d32', label: 'N' },
  meet: { bg: '#e3f2fd', color: '#1565c0', label: 'M' },
  gmail: { bg: '#fce8e6', color: '#c5221f', label: 'G' },
  slack: { bg: '#f3e8fd', color: '#611f69', label: 'S' },
  gong: { bg: '#fff3e0', color: '#e65100', label: 'Go' },
  salesforce: { bg: '#e1f5fe', color: '#0277bd', label: 'SF' },
  build: { bg: '#fff8e1', color: '#f57f17', label: '⚡' },
  insight: { bg: '#f5f5f5', color: '#536471', label: '✦' }
}

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h`
}

type Props = { event: CentralStreamEvent; isNew?: boolean }

export function FeedPost({ event, isNew }: Props) {
  const av = AVATAR[event.source] ?? AVATAR.insight
  const handle =
    event.source === 'notch'
      ? 'Notch AI'
      : event.source === 'meet'
        ? 'Google Meet'
        : event.source.charAt(0).toUpperCase() + event.source.slice(1)

  return (
    <article className={`x-post ${isNew ? 'x-post-new' : ''}`}>
      <div className="x-avatar" style={{ background: av.bg, color: av.color }}>
        {av.label}
      </div>
      <div className="x-post-content">
        <div className="x-post-head">
          <span className="x-name">{handle}</span>
          <span className="x-handle">@{event.source}</span>
          <span className="x-dot">·</span>
          <span className="x-time">{timeAgo(event.ts)}</span>
        </div>

        <p className="x-post-title">{event.title}</p>
        <p className="x-post-body">{event.body}</p>

        {event.joinable && event.meetingLink && (
          <div className="x-meet-card">
            <div className="x-meet-icon">📹</div>
            <div className="x-meet-info">
              <p className="x-meet-title">Acme Corp — Technical Deep Dive</p>
              <p className="x-meet-sub">3 attendees · Notch transcribing</p>
            </div>
            <button type="button" className="x-join-btn" onClick={() => openMeeting(event.meetingLink!)}>
              Join
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
          <button type="button">💬</button>
          <button type="button">↻</button>
          <button type="button">♡</button>
          <button type="button">↗</button>
        </div>
      </div>
    </article>
  )
}
