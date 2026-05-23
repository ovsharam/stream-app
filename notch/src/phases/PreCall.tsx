import type { PreCallPrep } from '../../simulation/types'
import { AttendeeCard } from '../components/AttendeeCard'
import { TalkingPoint } from '../components/TalkingPoint'
import { CalendarBanner } from '../components/CalendarBanner'
import { CrossCaseCard } from '../components/CrossCaseCard'

type Props = { prep: PreCallPrep }

export function PreCall({ prep }: Props) {
  return (
    <div className="space-y-5">
      <CalendarBanner calendar={prep.calendar} />

      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/35">Up next · {prep.deal.company}</p>
        <h1 className="mt-1 text-base font-semibold text-white/90">{prep.deal.stage}</h1>
        <p className="mt-1 text-xs text-white/50">
          ${(prep.deal.acv / 1000).toFixed(0)}k ACV · {prep.deal.close_target}
        </p>
      </div>

      <CrossCaseCard patterns={prep.cross_case_patterns} />

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Attendees</h2>
        <div className="space-y-2">
          {prep.attendees.map((a) => (
            <AttendeeCard key={a.id} contact={a} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Talking points</h2>
        <div className="space-y-2">
          {prep.talking_points.map((tp, i) => (
            <TalkingPoint key={i} text={tp} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[10px] uppercase tracking-wider text-white/35">Last meeting</h2>
        <p className="text-xs leading-relaxed text-white/60">{prep.last_meeting_summary}</p>
        <ul className="mt-2 space-y-1">
          {prep.agreed_next_steps.map((s) => (
            <li key={s} className="text-xs text-white/45 before:mr-1.5 before:text-white/25 before:content-['·']">
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <h2 className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Context from last touch</h2>
        <p className="text-xs text-white/60">{prep.context_note}</p>
        {prep.watch_out && (
          <p className="mt-2 text-xs text-[#EF9F27]">Watch: {prep.watch_out}</p>
        )}
      </section>
    </div>
  )
}
