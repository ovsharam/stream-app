import type { ClusterContext, DashboardTab } from '@shared/cluster'

const NAV: { id: DashboardTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'integrations', label: 'Integrations', icon: '⚡' },
  { id: 'meetings', label: 'Meetings', icon: '▶' },
  { id: 'actions', label: 'Actions', icon: '→' },
  { id: 'activity', label: 'Activity', icon: '≡' }
]

type Props = {
  tab: DashboardTab
  onTab: (t: DashboardTab) => void
  ctx: ClusterContext
}

export function DashboardSidebar({ tab, onTab, ctx }: Props) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-200/80 bg-white">
      <div className="border-b border-neutral-100 px-4 py-5">
        <p className="text-xs font-semibold">Notch</p>
        <p className="mt-0.5 truncate text-[10px] text-neutral-500">{ctx.activeDeal.company}</p>
      </div>
      <nav className="flex-1 p-2">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onTab(n.id)}
            className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
              tab === n.id ? 'bg-neutral-100 font-medium' : 'text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <span className="text-xs opacity-50">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
      <div className="border-t border-neutral-100 p-4">
        <p className="text-[10px] uppercase tracking-wider text-neutral-400">Mobile cluster</p>
        <p className="mt-1 text-xs text-neutral-600">Droplet below notch · ⌘⇧Space</p>
      </div>
    </aside>
  )
}
