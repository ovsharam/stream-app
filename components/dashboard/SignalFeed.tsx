type Props = { signals: { type: string; content: string; source: string }[] }

const TYPE_COLOR: Record<string, string> = {
  blocker: 'text-red-600',
  budget: 'text-emerald-600',
  champion: 'text-violet-600',
  technical: 'text-blue-600'
}

export function SignalFeed({ signals }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold">Knowledge graph signals</h2>
      <div className="mt-3 space-y-2">
        {signals.map((s) => (
          <div key={s.content} className="flex items-start gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
            <span className={`shrink-0 font-mono text-[10px] uppercase ${TYPE_COLOR[s.type] ?? 'text-neutral-500'}`}>
              {s.type}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-neutral-800">{s.content}</p>
              <p className="text-[10px] text-neutral-400">{s.source}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
