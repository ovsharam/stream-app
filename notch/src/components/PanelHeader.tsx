import type { Phase } from '../../simulation/types'

const LABELS: Record<Phase, string> = {
  idle: 'Idle',
  pre_call: 'Pre-call',
  live_call: 'Live',
  post_call: 'Post-call'
}

type Props = {
  phase: Phase
  callActive: boolean
  simulationMode: boolean
}

export function PanelHeader({ phase, callActive, simulationMode }: Props) {
  return (
    <div className="drag-region flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${callActive ? 'live-pulse bg-[#50DC78]' : 'bg-white/25'}`}
        />
        <span className="text-xs font-medium text-white/75">Plumb</span>
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
          {LABELS[phase]}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {simulationMode && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-teal-400/80">sim</span>
        )}
        <span className="text-white/20" title="Drag to move">
          ⠿
        </span>
      </div>
    </div>
  )
}
