import type { Phase } from '../../simulation/types'

type Props = {
  phase: Phase
  onStart: () => void
  onEnd: () => void
  onPrep: () => void
}

export function DemoControls({ phase, onStart, onEnd, onPrep }: Props) {
  return (
    <div className="shrink-0 border-t border-white/10 px-3 py-2.5">
      <div className="flex gap-2">
        {phase !== 'live_call' && (
          <button
            type="button"
            onClick={onStart}
            className="flex-1 rounded-lg bg-[#378ADD]/20 py-2 text-xs font-medium text-[#85B7EB] hover:bg-[#378ADD]/30"
          >
            Start call
          </button>
        )}
        {phase === 'live_call' && (
          <button
            type="button"
            onClick={onEnd}
            className="flex-1 rounded-lg bg-[#E24B4A]/15 py-2 text-xs font-medium text-[#F09595] hover:bg-[#E24B4A]/25"
          >
            End call
          </button>
        )}
        {phase === 'post_call' && (
          <button
            type="button"
            onClick={onPrep}
            className="flex-1 rounded-lg bg-white/5 py-2 text-xs font-medium text-white/60 hover:bg-white/10"
          >
            Back to prep
          </button>
        )}
      </div>
      <p className="mt-2 text-center font-mono text-[9px] text-white/20">
        ⌘⇧D · ⌘⇧E · ⌘⇧Space
      </p>
    </div>
  )
}
