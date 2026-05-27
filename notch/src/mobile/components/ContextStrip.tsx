import type { ContextChip } from '@shared/mobile'

export function ContextStrip({ chips }: { chips: ContextChip[] }) {
  if (!chips.length) return null
  return (
    <div className="context-strip">
      <span className="strip-label">Now</span>
      <div className="strip-chips">
        {chips.map((c) => (
          <span key={c.id} className={`chip chip-${c.type}`}>
            {c.type === 'live' && <span className="chip-live-dot" />}
            {c.content}
          </span>
        ))}
      </div>
    </div>
  )
}
