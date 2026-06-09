import { dismissAppToast, useAppToastQueue, type AppToast, type AppToastKind } from './appToastStore'

const KIND_LABELS: Record<AppToastKind, string> = {
  meeting: 'Meeting',
  agent: 'LinkedIn',
  info: 'Info'
}

function ToastCard({ toast }: { toast: AppToast }) {
  const primary = toast.actions?.find((a) => a.primary) ?? toast.actions?.[0]
  const kindClass =
    toast.kind === 'meeting'
      ? 'x-toast-meeting'
      : toast.kind === 'agent'
        ? 'x-toast-agent'
        : 'x-toast-info'
  const urgentClass = toast.urgency === 'high' ? 'x-toast-urgent' : ''

  const onBodyClick = () => {
    if (primary) primary.onClick()
  }

  return (
    <div
      className={`x-toast x-toast-enter ${kindClass} ${urgentClass}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="x-toast-body"
        onClick={onBodyClick}
        disabled={!primary}
      >
        <span className="x-toast-badge">{KIND_LABELS[toast.kind]}</span>
        <span className="x-toast-copy">
          <span className="x-toast-title">{toast.title}</span>
          <span className="x-toast-subtitle">{toast.subtitle}</span>
        </span>
      </button>
      {toast.actions && toast.actions.length > 0 ? (
        <div className="x-toast-actions">
          {toast.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? 'x-toast-action x-toast-action-primary' : 'x-toast-action'}
              onClick={(e) => {
                e.stopPropagation()
                action.onClick()
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="x-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => dismissAppToast(toast.id)}
      >
        ✕
      </button>
    </div>
  )
}

export function AppToastStack() {
  const queue = useAppToastQueue()
  if (queue.length === 0) return null

  return (
    <div className="x-toast-stack" aria-label="Notifications">
      {queue.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
