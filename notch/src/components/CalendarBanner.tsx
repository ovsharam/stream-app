import type { CalendarEvent } from '../../simulation/types'

type Props = { calendar: CalendarEvent }

export function CalendarBanner({ calendar }: Props) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-white/35">Starting in {calendar.starts_in_minutes} min</p>
      <p className="mt-0.5 text-sm font-medium text-white/85">{calendar.title}</p>
      <a
        href={calendar.meeting_link}
        className="mt-1 block truncate font-mono text-[10px] text-[#85B7EB]/80 hover:text-[#85B7EB]"
        onClick={(e) => e.preventDefault()}
      >
        {calendar.meeting_link.replace('https://', '')}
      </a>
    </div>
  )
}
