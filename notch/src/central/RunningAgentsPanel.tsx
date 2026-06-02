import type { PanelAgent } from './runningAgentsStore'

type Props = {
  agents: PanelAgent[]
  onStopAll: () => void
  onDismiss: () => void
  onFocusMeeting?: (meetingId: string) => void
}

function AgentGridIcon() {
  return (
    <svg
      className="x-running-agents-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <rect x="1.5" y="1.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="8.5" y="1.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="1.5" y="8.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="8.5" y="8.5" width="4" height="4" rx="1" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

export function RunningAgentsPanel({ agents, onStopAll, onDismiss, onFocusMeeting }: Props) {
  if (agents.length === 0) return null

  const countLabel = agents.length === 1 ? '1 Working' : `${agents.length} Working`

  return (
    <section className="x-running-agents-panel" aria-label="Running agents">
      <header className="x-running-agents-header">
        <span className="x-running-agents-count">{countLabel}</span>
        <div className="x-running-agents-actions">
          <button type="button" className="x-running-agents-stop" onClick={onStopAll}>
            Stop All
          </button>
          <button
            type="button"
            className="x-running-agents-close"
            onClick={onDismiss}
            aria-label="Hide running agents"
          >
            ×
          </button>
        </div>
      </header>
      <ul className="x-running-agents-list">
        {agents.map((agent) => {
          const row = (
            <>
              <AgentGridIcon />
              <div className="x-running-agents-text">
                <span className="x-running-agents-title">{agent.title}</span>
                <span className="x-running-agents-status">{agent.status}</span>
              </div>
            </>
          )

          return (
            <li key={agent.id} className="x-running-agents-item">
              {agent.meetingId && onFocusMeeting ? (
                <button
                  type="button"
                  className="x-running-agents-row x-running-agents-row-btn"
                  onClick={() => onFocusMeeting(agent.meetingId!)}
                >
                  {row}
                </button>
              ) : (
                <div className="x-running-agents-row">{row}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
