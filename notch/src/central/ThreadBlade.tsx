import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ClusterThread, ClusterThreadUpdate } from '@shared/cluster'
import { clusterApi, integrationApi, openExternal } from '../lib/api'
import { IconSend } from './Icons'

type Props = {
  itemId: string
  day?: string
  contextItemId?: string
  onClose: () => void
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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

function ThreadMessage({ update }: { update: ClusterThreadUpdate }) {
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

export function ThreadBlade({ itemId, day, contextItemId, onClose }: Props) {
  const [thread, setThread] = useState<ClusterThread | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isGmail = thread?.source === 'gmail'

  const loadThread = useCallback(async () => {
    setThread(await clusterApi.thread(itemId, day))
  }, [itemId, day])

  useEffect(() => {
    void loadThread()
  }, [loadThread])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3000)
    return () => window.clearTimeout(t)
  }, [flash])

  const replyCount = useMemo(() => thread?.updates.length ?? 0, [thread?.updates.length])
  const canSend = Boolean(draft.trim()) && !busy && thread?.canExecute

  const send = async () => {
    const text = draft.trim()
    if (!text || busy || !thread?.canExecute) return
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
        setDraft('')
        await integrationApi.syncSource('gmail')
        await loadThread()
        window.dispatchEvent(new Event('stream:user-role'))
        return
      }

      const run = await clusterApi.mondayRun(itemId, `@this ${text}`)
      setFlash(run.message)
      setDraft('')
      await integrationApi.syncSource('monday')
      await loadThread()
    } catch (err) {
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
        <h2 className="x-thread-topbar-title">{isGmail ? thread?.itemTitle ?? 'Email' : 'Thread'}</h2>
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

      <div className="x-thread-body">
        {thread?.parent && <ThreadMessage update={thread.parent} />}

        {replyCount > 0 && (
          <div className="x-thread-divider" role="separator">
            <span>{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
          </div>
        )}

        {thread?.updates.map((u) => (
          <ThreadMessage key={u.id} update={u} />
        ))}

        {!thread && <p className="x-thread-placeholder">Loading…</p>}
      </div>

      <footer className="x-thread-reply-bar">
        {(flash || error) && (
          <p className={`x-thread-flash ${error ? 'is-error' : ''}`}>{error ?? flash}</p>
        )}

        {thread?.canExecute ? (
          <>
            <div className="x-thread-reply-row">
              <div className="x-thread-reply-avatar">A</div>
              <div className="x-thread-reply-composer">
                <div className="x-thread-reply-field">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={isGmail ? 'Reply to thread…' : 'Reply…'}
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
                    ? 'Enter or the send button · Shift+Enter for newline'
                    : 'Plain text posts a comment · move to Done changes status'}
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="x-thread-reply-hint">
            {isGmail
              ? 'Connect Gmail in Settings to reply here.'
              : 'Connect Monday in Settings to reply here.'}
          </p>
        )}
      </footer>
    </aside>
  )
}
