'use client'

import type { CentralStreamEvent } from '@shared/cluster'
import { SOURCE_META, fakeEngagement, formatFeedTime } from '@/lib/feed-meta'

type Props = {
  event: CentralStreamEvent
  isNew?: boolean
}

export function FeedPost({ event, isNew }: Props) {
  const meta = SOURCE_META[event.source]
  const eng = fakeEngagement(event.id)
  const isLive = event.kind === 'transcript_live'
  const isHot = event.kind === 'build_prompt' || event.kind === 'insight'

  return (
    <article className={`feed-post ${isNew ? 'feed-post-new' : ''} ${isHot ? 'feed-post-hot' : ''}`}>
      <div className="feed-post-vote">
        <button type="button" className="feed-vote-btn" aria-label="Upvote">
          ▲
        </button>
        <span className="feed-vote-count">{eng.likes}</span>
        <button type="button" className="feed-vote-btn feed-vote-down" aria-label="Downvote">
          ▼
        </button>
      </div>

      <div className="feed-post-body">
        <div className="feed-post-head">
          <div className="feed-avatar" style={{ backgroundColor: meta.bg, color: meta.color }}>
            {meta.avatar}
          </div>
          <div className="feed-post-meta">
            <span className="feed-handle" style={{ color: meta.color }}>
              {meta.handle}
            </span>
            <span className="feed-dot">·</span>
            <span className="feed-time">{formatFeedTime(event.ts)}</span>
            {isLive && <span className="feed-live-badge">LIVE</span>}
            {event.highlight && <span className="feed-tag">{event.highlight}</span>}
          </div>
        </div>

        <h3 className="feed-title">{event.title}</h3>
        <p className="feed-text">{event.body}</p>

        {event.promptPreview && (
          <div className="feed-prompt-box">
            <span className="feed-prompt-label">→ workflow agent prompt</span>
            <code className="feed-prompt-code">{event.promptPreview}</code>
          </div>
        )}

        <div className="feed-actions">
          <button type="button">💬 {eng.replies}</button>
          <button type="button">↻ {eng.reposts}</button>
          <button type="button">♡ {eng.likes}</button>
          <button type="button">⬡ Share</button>
        </div>
      </div>
    </article>
  )
}
