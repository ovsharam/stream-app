type Props = {
  deal: { company: string; stage: string; acv: number; healthScore: number }
  signals: { type: string; content: string }[]
}

export function DealHeader({ deal, signals }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Active deal</p>
          <h2 className="mt-1 text-xl font-semibold">{deal.company}</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {deal.stage} · ${(deal.acv / 1000).toFixed(0)}k ACV
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-400">Health</p>
          <p className="text-2xl font-semibold tabular-nums">{deal.healthScore}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {signals.slice(0, 4).map((s) => (
          <span
            key={s.content}
            className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-600"
          >
            {s.content}
          </span>
        ))}
      </div>
    </div>
  )
}
