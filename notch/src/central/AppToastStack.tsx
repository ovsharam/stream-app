import { dismissAppToast, useAppToastQueue, type AppToast, type AppToastKind } from './appToastStore'

const KIND_LABELS: Record<AppToastKind, string> = {
  meeting: 'Meeting',
  agent: 'LinkedIn',
  info: 'Info'
}

function ToastCard({ toast }: { toast: AppToast }) {
  const kindClass =
    toast.kind === 'meeting'
      ? 'x-toast-meeting'
      : toast.kind === 'agent'
        ? 'x-toast-agent'
        : 'x-toast-info'
  const urgentClass = toast.urgency === 'high' ? ' x-toast-urgent' : ''
  const actions = toast.actions ?? []

  return (
    <div
      className={`x-toast x-toast-enter${urgentClass} ${kindClass}`}
      role="status"
      aria-live="polite"
    >
      <div className="x-toast-inner">
        <div className="x-toast-head">
          <span className="x-toast-badge">{KIND_LABELS[toast.kind]}</span>
          <button
            type="button"
            className="x-toast-dismiss"
            aria-label="Dismiss"
            onClick={() => dismissAppToast(toast.id)}
          >
            ×
          </button>
        </div>
        <p className="x-toast-title">{toast.title}</p>
        {toast.subtitle ? <p className="x-toast-subtitle">{toast.subtitle}</p> : null}
        {actions.length > 0 ? (
          <div className="x-toast-foot">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.primary ? 'x-toast-pill x-toast-pill-primary' : 'x-toast-pill'}
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
      </div>
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
