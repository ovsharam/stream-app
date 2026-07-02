import { useEffect, useRef } from 'react'
import {
  useNotifications,
  useUnreadCount,
  dismissNotification,
  clearAllNotifications,
  markAllRead,
  type Notification,
  type NotificationKind,
} from './notificationHistoryStore'

const KIND_META: Record<NotificationKind, { label: string; color: string }> = {
  meeting: { label: 'Calendar', color: '#00897b' },
  agent: { label: 'LinkedIn', color: '#0a66c2' },
  info: { label: 'Notch', color: '#cc785c' },
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function NotificationCard({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: () => void
}) {
  const meta = KIND_META[notification.kind]
  const actions = notification.actions ?? []

  return (
    <div className="x-nb-card">
      <div className="x-nb-card-header">
        <span
          className="x-nb-card-source"
          style={{ '--nb-dot': meta.color } as React.CSSProperties}
        >
          {meta.label}
        </span>
        <span className="x-nb-card-time">{timeAgo(notification.timestamp)}</span>
        <button
          type="button"
          className="x-nb-card-dismiss"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      <p className="x-nb-card-title">{notification.title}</p>
      {notification.subtitle ? (
        <p className="x-nb-card-body">{notification.subtitle}</p>
      ) : null}
      {actions.length > 0 ? (
        <div className="x-nb-card-actions">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`x-nb-card-btn${a.primary ? ' x-nb-card-btn-primary' : ''}`}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function NotificationBell({ onClick }: { onClick: () => void }) {
  const count = useUnreadCount()
  return (
    <button
      type="button"
      className="x-notif-bell"
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      title="Notifications"
      onClick={onClick}
    >
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <path
          d="M7.5 1.5C5.15 1.5 3.25 3.4 3.25 5.75V9.5L2 11h11l-1.25-1.5V5.75C11.75 3.4 9.85 1.5 7.5 1.5z"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M6 12c0 .83.67 1.5 1.5 1.5S9 12.83 9 12"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      {count > 0 ? (
        <span className="x-notif-bell-badge" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </button>
  )
}

type Props = {
  open: boolean
  onClose: () => void
}

export function NotificationBlade({ open, onClose }: Props) {
  const notifications = useNotifications()
  const bladeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open) markAllRead()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      {open ? (
        <div
          className="x-nb-overlay"
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={bladeRef}
        className={`x-nb${open ? ' x-nb-open' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label="Notifications"
        aria-hidden={!open}
      >
        <div className="x-nb-head">
          <h2 className="x-nb-title">Notifications</h2>
          <div className="x-nb-head-actions">
            {notifications.length > 0 ? (
              <button
                type="button"
                className="x-nb-clear-all"
                onClick={clearAllNotifications}
              >
                Clear All
              </button>
            ) : null}
            <button
              type="button"
              className="x-nb-close"
              aria-label="Close notifications"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="x-nb-body">
          {notifications.length === 0 ? (
            <div className="x-nb-empty">
              <svg
                className="x-nb-empty-icon"
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 5C13 5 7.5 10.5 7.5 17.5V26L5 29h30l-2.5-3V17.5C32.5 10.5 27 5 20 5z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M16 31c0 2.2 1.8 4 4 4s4-1.8 4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <p className="x-nb-empty-text">No notifications</p>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onDismiss={() => dismissNotification(n.id)}
              />
            ))
          )}
        </div>
      </aside>
    </>
  )
}
