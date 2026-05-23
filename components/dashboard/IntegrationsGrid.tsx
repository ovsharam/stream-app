import type { ClusterIntegration } from '@shared/cluster'

type Props = { integrations: ClusterIntegration[]; full?: boolean }

export function IntegrationsGrid({ integrations, full }: Props) {
  return (
    <div className={full ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-2'}>
      {!full && <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Integrations</p>}
      {integrations.map((i) => (
        <div
          key={i.id}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium">{i.name}</p>
            <p className="text-[10px] text-neutral-400">{i.lastSync ? `Synced ${i.lastSync}` : 'Not connected'}</p>
          </div>
          <span
            className={`h-2 w-2 rounded-full ${i.connected ? 'bg-emerald-500' : 'bg-neutral-300'}`}
            title={i.connected ? 'Connected' : 'Disconnected'}
          />
        </div>
      ))}
      {full && (
        <button
          type="button"
          className="flex items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 py-8 text-sm text-neutral-500 hover:border-neutral-400"
        >
          + Connect integration
        </button>
      )}
    </div>
  )
}
