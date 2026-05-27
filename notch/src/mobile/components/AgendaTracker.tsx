import type { MobileAgenda } from '@shared/mobile'

export function AgendaTracker({ agenda }: { agenda: MobileAgenda | null }) {
  if (!agenda) return null
  return (
    <div className="agenda-tracker">
      <div className="at-current">
        <span className="at-badge">Now</span>
        <span className="at-item">{agenda.current}</span>
      </div>
      <div className="at-remaining">
        {agenda.remaining.map((item) => (
          <div key={item} className="at-item-muted">
            {item}
          </div>
        ))}
      </div>
      <div className="at-goal">
        <span className="at-goal-label">Goal:</span>
        <span className="at-goal-text">{agenda.callGoal}</span>
      </div>
    </div>
  )
}
