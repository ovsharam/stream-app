import type { PreCallPrep } from '../../simulation/types'
import type { NotchStatePayload } from '../types'
import { LiveAnswer } from '../components/LiveAnswer'
import { LoadBearingQ } from '../components/LoadBearingQ'
import { SignalChip } from '../components/SignalChip'
import { TalkingPoint } from '../components/TalkingPoint'

type Props = {
  prep: PreCallPrep
  live: NotchStatePayload['live']
  onTogglePoint: (idx: number) => void
}

export function LiveCall({ prep, live, onTogglePoint }: Props) {
  return (
    <div className="space-y-4">
      {live.liveAnswer && (
        <LiveAnswer
          question={live.liveAnswer.question}
          response={live.liveAnswer.response}
          sources={live.liveAnswer.sources}
        />
      )}

      {live.loadBearing.length > 0 && (
        <section>
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Load-bearing questions</h2>
          <div className="space-y-2">
            {live.loadBearing.map((q, i) => (
              <LoadBearingQ key={i} content={q.content} urgency={q.urgency} />
            ))}
          </div>
        </section>
      )}

      {live.signals.length > 0 && (
        <section>
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Signals extracted</h2>
          <div className="flex flex-wrap gap-1.5">
            {live.signals.map((s, i) => (
              <SignalChip key={i} type={s.type} content={s.content} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Talking points</h2>
        <div className="space-y-2">
          {prep.talking_points.map((tp, i) => (
            <TalkingPoint
              key={i}
              text={tp}
              checked={live.checkedPoints.includes(i)}
              onToggle={() => onTogglePoint(i)}
            />
          ))}
        </div>
      </section>

      {live.transcript.length > 0 && (
        <section className="rounded-lg border border-white/10 bg-black/20 p-3">
          <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Live transcript</h2>
          <div className="max-h-36 space-y-2 overflow-y-auto">
            {live.transcript.map((line, i) => (
              <div key={i} className={i === live.transcript.length - 1 ? 'opacity-100' : 'opacity-50'}>
                <p className="text-[10px] text-white/40">{line.speaker}</p>
                <p className="text-xs leading-relaxed text-white/70">{line.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
