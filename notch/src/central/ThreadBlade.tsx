import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClusterThread, ClusterThreadUpdate } from '@shared/cluster'
import { clusterApi, integrationApi, openExternal } from '../lib/api'
import { IconMonday, IconSend } from './Icons'

type Props = {
  itemId: string
  day?: string
  contextItemId?: string
  onClose: () => void
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dateLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hues = ['#ff3d57', '#5865f2', '#00897b', '#7c3aed', '#0176d3', '#f59e0b']
  return hues[Math.abs(hash) % hues.length]
}

function allMessages(thread: ClusterThread | null): ClusterThreadUpdate[] {
  if (!thread) return []
  const merged = [...(thread.parent ? [thread.parent] : []), ...thread.updates]
  const seen = new Set<string>()
  return merged
    .filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })
    .sort((a, b) => a.ts - b.ts)
}

function CommentMessage({ update }: { update: ClusterThreadUpdate }) {
  const color = avatarColor(update.actor)
  return (
    <article className="x-thread-msg">
      <div className="x-thread-msg-avatar" style={{ background: color }}>
        {initials(update.actor)}
      </div>
      <div className="x-thread-msg-main">
        <div className="x-thread-msg-meta">
          <span className="x-thread-msg-author">{update.actor}</span>
          <span className="x-thread-msg-time">{time(update.ts)}</span>
        </div>
        <div className="x-thread-msg-text">{update.body}</div>
      </div>
    </article>
  )
}

function ActivityRow({ update }: { update: ClusterThreadUpdate }) {
  return (
    <li className="x-thread-activity-row">
      <span className="x-thread-activity-dot" aria-hidden />
      <span className="x-thread-activity-text">{update.body}</span>
      <time className="x-thread-activity-time">{time(update.ts)}</time>
    </li>
  )
}

export function ThreadBlade({ itemId, day, contextItemId, onClose }: Props) {
  const [thread, setThread] = useState<ClusterThread | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [pending, setPending] = useState<ClusterThreadUpdate[]>([])

  const isGmail = thread?.source === 'gmail' || itemId.startsWith('gmail-')

  const loadThread = useCallback(async () => {
    setThread(await clusterApi.thread(itemId, day))
    setPending([])
  }, [itemId, day])

  useEffect(() => {
    void loadThread()
  }, [loadThread])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3000)
    return () => window.clearTimeout(t)
  }, [flash])

  const messages = useMemo(() => allMessages(thread), [thread])
  const comments = useMemo(
    () => [...messages.filter((m) => m.kind !== 'activity'), ...pending],
    [messages, pending]
  )
  const activity = useMemo(() => messages.filter((m) => m.kind === 'activity'), [messages])
  const canSend = Boolean(draft.trim()) && !busy && thread?.canExecute

  const send = async () => {
    const text = draft.trim()
    if (!text || busy || !thread?.canExecute) return

    const optimistic: ClusterThreadUpdate = {
      id: `pending-${Date.now()}`,
      ts: Date.now(),
      actor: 'You',
      body: text,
      source: isGmail ? 'gmail' : 'monday',
      kind: 'comment'
    }
    setPending((prev) => [...prev, optimistic])
    setDraft('')
    setBusy(true)
    setError(null)

    try {
      if (isGmail) {
        const result = await clusterApi.runAction({
          text: `@gmail reply: ${text}`,
          contextItemId: contextItemId ?? itemId
        })
        if (!result.ok) throw new Error(result.message)
        setFlash(result.message)
        await integrationApi.syncSource('gmail')
        await loadThread()
        window.dispatchEvent(new Event('stream:user-role'))
        return
      }

      const run = await clusterApi.mondayRun(itemId, `@this ${text}`)
      setFlash(run.message)
      await integrationApi.syncSource('monday')
      await loadThread()
    } catch (err) {
      setPending((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(text)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const externalLabel = isGmail ? 'Open in Gmail' : 'Open in Monday'

  return (
    <aside className="x-thread-blade" aria-label="Thread">
      <header className="x-thread-topbar">
        <button type="button" className="x-thread-icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="x-thread-topbar-title">{thread?.itemTitle ?? 'Thread'}</h2>
        <button
          type="button"
          className="x-thread-icon-btn"
          aria-label={externalLabel}
          title={externalLabel}
          onClick={() => thread?.taskUrl && openExternal(thread.taskUrl)}
        >
          ↗
        </button>
      </header>

      {thread && !isGmail ? (
        <div className="x-thread-item-head">
          <div className="x-thread-item-brand" aria-hidden>
            <IconMonday className="x-thread-item-brand-icon" />
          </div>
          <div className="x-thread-item-meta">
            <p className="x-thread-item-title">{thread.itemTitle}</p>
            {thread.boardName ? (
              <p className="x-thread-item-board">{thread.boardName}</p>
            ) : null}
            {thread.currentStatus ? (
              <span className="x-thread-status-pill">{thread.currentStatus}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="x-thread-body">
        {!thread ? (
          <p className="x-thread-placeholder">Loading…</p>
        ) : (
          <>
            {activity.length > 0 ? (
              <section className="x-thread-activity">
                <button
                  type="button"
                  className="x-thread-activity-toggle"
                  aria-expanded={activityOpen}
                  onClick={() => setActivityOpen((v) => !v)}
                >
                  {activityOpen ? '▾' : '▸'} Board activity · {activity.length}
                </button>
                {activityOpen ? (
                  <ul className="x-thread-activity-list">
                    {activity.map((u) => (
                      <ActivityRow key={u.id} update={u} />
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {comments.length === 0 ? (
              <p className="x-thread-empty-comments">
                {isGmail ? 'No messages yet.' : 'No comments yet — reply below.'}
              </p>
            ) : (
              comments.map((u, i) => {
                const prev = comments[i - 1]
                const showDate = !prev || dateLabel(prev.ts) !== dateLabel(u.ts)
                return (
                  <div key={u.id}>
                    {showDate ? (
                      <div className="x-thread-date-divider">
                        <span>{dateLabel(u.ts)}</span>
                      </div>
                    ) : null}
                    <CommentMessage update={u} />
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      <footer className="x-thread-reply-bar">
        {(flash || error) && (
          <p className={`x-thread-flash ${error ? 'is-error' : ''}`}>{error ?? flash}</p>
        )}

        {thread?.canExecute ? (
          <div className="x-thread-reply-row">
            <div className="x-thread-reply-avatar">A</div>
            <div className="x-thread-reply-composer">
              <div className="x-thread-reply-field">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={isGmail ? 'Reply to thread…' : 'Comment or "move to Done"…'}
                  rows={1}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                />
                <button
                  type="button"
                  className="x-thread-reply-send"
                  disabled={!canSend}
                  aria-label="Send reply"
                  title="Send"
                  onClick={() => void send()}
                >
                  <IconSend className="x-thread-reply-send-icon" />
                </button>
              </div>
              <p className="x-thread-reply-hint">
                {isGmail
                  ? 'Enter to send · Shift+Enter for newline'
                  : 'Comment · "move to Done" · @monday create: for new ticket'}
              </p>
            </div>
          </div>
        ) : (
          <p className="x-thread-reply-hint">
            {isGmail
              ? 'Connect Gmail in Apps to reply here.'
              : 'Connect Monday in Apps to reply here.'}
          </p>
        )}
      </footer>
    </aside>
  )
}
