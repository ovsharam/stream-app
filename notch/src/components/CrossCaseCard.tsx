import type { CrossCasePattern } from '../../simulation/types'

type Props = { patterns: CrossCasePattern[] }

export function CrossCaseCard({ patterns }: Props) {
  if (patterns.length === 0) return null

  return (
    <section className="rounded-lg border border-[#378ADD]/20 bg-[#378ADD]/[0.05] p-3">
      <h2 className="mb-2 text-[10px] uppercase tracking-wider text-[#85B7EB]/70">
        Cross-case pattern
      </h2>
      <div className="space-y-2">
        {patterns.slice(0, 3).map((p) => (
          <div key={`${p.dealId}-${p.content}`} className="text-xs">
            <span className="font-medium text-white/70">{p.company}</span>
            <span className="text-white/45"> — {p.content}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
