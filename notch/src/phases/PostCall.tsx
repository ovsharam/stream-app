import type { PostCallSummary } from '../../simulation/types'
import { SignalChip } from '../components/SignalChip'

type Props = { summary: PostCallSummary }

export function PostCall({ summary }: Props) {
  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Call summary</h2>
        <p className="text-xs leading-relaxed text-white/70">{summary.summary}</p>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Signals captured</h2>
        <div className="flex flex-wrap gap-1.5">
          {summary.signals.map((s, i) => (
            <SignalChip key={i} type={s.type} content={s.content} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Actions queued</h2>
        <div className="space-y-2">
          {summary.actions.map((a) => (
            <div
              key={a.label}
              className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <span className="text-xs text-white/70">{a.label}</span>
              <span
                className={`shrink-0 font-mono text-[9px] uppercase ${
                  a.status === 'ready'
                    ? 'text-[#85B7EB]'
                    : a.status === 'applied'
                      ? 'text-[#97C459]'
                      : 'text-white/35'
                }`}
              >
                {a.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="no-drag w-full rounded-lg border border-[#85B7EB]/30 bg-[#378ADD]/10 py-2.5 text-xs font-medium text-[#85B7EB]"
      >
        Review follow-up email
      </button>
    </div>
  )
}
