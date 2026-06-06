import type { AgentCalendarCheck } from '../../shared/agent-proposal'
import { getMergedCalendarRailEvents } from '../sources/calendar'

const DEFAULT_TZ = process.env.STREAM_TZ ?? 'America/Los_Angeles'

export function formatSlotTimeLabel(iso: string, tz = DEFAULT_TZ): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
    timeZoneName: 'short'
  }).formatToParts(d)
  const hour = parts.find((p) => p.type === 'hour')?.value ?? ''
  const minute = parts.find((p) => p.type === 'minute')?.value
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value?.toLowerCase() ?? ''
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  const time =
    minute && minute !== '00' ? `${hour}:${minute}${dayPeriod}` : `${hour}${dayPeriod}`
  return `${time} ${tzName}`.trim()
}

export function checkProposedSlotFree(
  isoStart: string,
  durationMin = 30
): AgentCalendarCheck {
  const startMs = new Date(isoStart).getTime()
  if (Number.isNaN(startMs)) {
    return { proposedIso: isoStart, isFree: false }
  }
  const endMs = startMs + durationMin * 60_000
  const timeLabel = formatSlotTimeLabel(isoStart)

  for (const evt of getMergedCalendarRailEvents()) {
    if (evt.endsAt <= startMs || evt.startsAt >= endMs) continue
    return {
      proposedIso: isoStart,
      timeLabel,
      isFree: false,
      conflictingEvent: evt.title
    }
  }

  return { proposedIso: isoStart, timeLabel, isFree: true }
}
