import type { ClusterAction } from '@shared/cluster'

const STATUS: Record<string, string> = {
  ready: 'text-blue-600 bg-blue-50',
  applied: 'text-emerald-700 bg-emerald-50',
  queued: 'text-neutral-500 bg-neutral-100'
}

type Props = { actions: ClusterAction[]; compact?: boolean }

export function ActionsQueue({ actions, compact }: Props) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold">Actions queue</h2>
      <div className={`mt-3 space-y-2 ${compact ? '' : ''}`}>
        {actions.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{a.label}</p>
              <p className="text-[10px] capitalize text-neutral-400">{a.type}</p>
            </div>
            <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${STATUS[a.status]}`}>
              {a.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
