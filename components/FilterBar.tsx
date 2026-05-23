import type { StreamSource } from '@shared/types'
import { useStreamStore } from '@/store/streamStore'

const CHIPS: { id: StreamSource | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'slack', label: 'Slack' },
  { id: 'x', label: 'X' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'note', label: 'Notes' }
]

export function FilterBar() {
  const activeSources = useStreamStore((s) => s.activeSources)
  const toggleSource = useStreamStore((s) => s.toggleSource)

  return (
    <div className="flex h-filter shrink-0 items-center gap-2 overflow-x-auto border-b border-stream-border px-4">
      {CHIPS.map((chip) => {
        const active =
          chip.id === 'all' ? activeSources.has('all') : activeSources.has(chip.id)
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => toggleSource(chip.id)}
            className={`shrink-0 rounded-full px-3 py-1 font-mono text-xs transition-colors ${
              active
                ? 'bg-stream-primary text-stream-bg'
                : 'bg-stream-surface text-stream-secondary hover:text-stream-primary'
            }`}
          >
            {chip.label}
          </button>
        )
      })}
    </div>
  )
}
