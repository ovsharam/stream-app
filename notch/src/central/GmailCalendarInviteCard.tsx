import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { CentralStreamEvent } from '@shared/cluster'
import type { CalendarRailEvent } from '@shared/cluster'
import {
  isGmailCalendarInviteSubject,
  isSameCalendarDay,
  parseInviteStartAt,
  type GmailCalendarInvite,
  type GmailCalendarInviteRsvp
} from '@shared/gmail-calendar-invite'
import { clusterApi, openBrowserLink } from '../lib/api'

function metaStr(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = meta?.[key]
  if (v == null || v === '') return undefined
  return String(v)
}

function metaJson<T>(meta: Record<string, unknown> | undefined, key: string): T | undefined {
  const raw = meta?.[key]
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      return undefined
    }
  }
  if (raw && typeof raw === 'object') return raw as T
  return undefined
}

export function isCalendarInviteEvent(event: CentralStreamEvent): boolean {
  if (metaStr(event.meta, 'calendarInvite') === 'true') return true
  const subject = metaStr(event.meta, 'subject') ?? event.title ?? ''
  return isGmailCalendarInviteSubject(subject)
}

function inviteFromMeta(event: CentralStreamEvent): Partial<GmailCalendarInvite> {
  const whenLabel = metaStr(event.meta, 'whenLabel')
  const startAtRaw = metaStr(event.meta, 'startAt')
  const startAt = startAtRaw ? Number(startAtRaw) : whenLabel ? parseInviteStartAt(whenLabel) : undefined

  return {
    eventTitle: metaStr(event.meta, 'eventTitle'),
    whenLabel,
    where: metaStr(event.meta, 'where'),
    who: metaStr(event.meta, 'who'),
    timezone: metaStr(event.meta, 'timezone'),
    calendarUrl: metaStr(event.meta, 'calendarUrl'),
    startAt: Number.isFinite(startAt) ? startAt : undefined,
    monthAbbr: metaStr(event.meta, 'monthAbbr'),
    dayNumber: metaStr(event.meta, 'dayNumber') ? Number(metaStr(event.meta, 'dayNumber')) : undefined,
    weekday: metaStr(event.meta, 'weekday'),
    inviteKind: metaStr(event.meta, 'inviteKind') as GmailCalendarInvite['inviteKind'],
    rsvpUrls: metaJson<Partial<Record<GmailCalendarInviteRsvp, string>>>(event.meta, 'rsvpUrls')
  }
}

function splitTimeLabel(label: string): { start: string; end: string } {
  const parts = label.split(/\s*[-–—]\s*/)
  return { start: parts[0]?.trim() ?? label, end: parts[1]?.trim() ?? '' }
}

function AgendaRow({ event }: { event: CalendarRailEvent }) {
  const { start, end } = splitTimeLabel(event.timeLabel)
  return (
    <div className={`x-gcal-invite-agenda-row${event.live ? ' x-gcal-invite-agenda-row-live' : ''}`}>
      <div className="x-gcal-invite-agenda-time">
        <span>{start}</span>
        {end ? <span className="x-gcal-invite-agenda-end">{end}</span> : null}
      </div>
      <p className="x-gcal-invite-agenda-title">{event.title}</p>
    </div>
  )
}

export function GmailCalendarInviteCard({ event }: { event: CentralStreamEvent }) {
  const [details, setDetails] = useState<Partial<GmailCalendarInvite> & { gmailUrl?: string }>(() =>
    inviteFromMeta(event)
  )
  const [agendaEvents, setAgendaEvents] = useState<CalendarRailEvent[]>([])

  const threadId = metaStr(event.meta, 'threadId')
  const accountId = metaStr(event.meta, 'accountId')
  const itemId = String(event.meta?.itemId ?? event.id.replace(/^ext-/, ''))

  useEffect(() => {
    if (!threadId && !itemId) return
    let cancelled = false
    void clusterApi
      .gmailCalendarInvite({ threadId, accountId, streamItemId: itemId })
      .then((data) => {
        if (cancelled) return
        setDetails((prev) => ({
          ...prev,
          ...data,
          rsvpUrls: { ...prev.rsvpUrls, ...data.rsvpUrls }
        }))
      })
      .catch(() => {
        /* optional enrichment */
      })
    return () => {
      cancelled = true
    }
  }, [threadId, accountId, itemId])

  const startAt = details.startAt

  useEffect(() => {
    if (!startAt) return
    let cancelled = false
    void clusterApi
      .calendar()
      .then((data) => {
        if (cancelled) return
        const sameDay = (data.events ?? []).filter((e) => isSameCalendarDay(e.startsAt, startAt))
        setAgendaEvents(sameDay.sort((a, b) => a.startsAt - b.startsAt))
      })
      .catch(() => {
        /* calendar optional */
      })
    return () => {
      cancelled = true
    }
  }, [startAt])

  const title =
    details.eventTitle ??
    metaStr(event.meta, 'eventTitle') ??
    (metaStr(event.meta, 'subject') ?? event.title ?? '').replace(/^[^:]+:\s*/, '').split(' @ ')[0]?.trim()

  const whenLabel = details.whenLabel
  const where = details.where
  const who = details.who
  const calendarUrl = details.calendarUrl
  const gmailUrl =
    details.gmailUrl ??
    (threadId ? `https://mail.google.com/mail/u/0/#inbox/${threadId}` : undefined)

  const monthAbbr = details.monthAbbr ?? '—'
  const dayNumber = details.dayNumber ?? (startAt ? new Date(startAt).getDate() : '—')
  const weekday = details.weekday ?? (startAt ? new Date(startAt).toLocaleDateString('en-US', { weekday: 'short' }) : '')

  const agendaHeading = useMemo(() => {
    if (!startAt) return 'Agenda'
    return new Date(startAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }, [startAt])

  const openLink = (e: MouseEvent, url: string) => {
    e.stopPropagation()
    openBrowserLink(url)
  }

  const onRsvp = (e: MouseEvent, kind: GmailCalendarInviteRsvp) => {
    e.stopPropagation()
    const url = details.rsvpUrls?.[kind] ?? gmailUrl
    if (url) openBrowserLink(url)
  }

  const canceled = details.inviteKind === 'canceled'

  return (
    <div className={`x-gcal-invite${canceled ? ' x-gcal-invite-canceled' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="x-gcal-invite-main">
        <div className="x-gcal-invite-date" aria-hidden>
          <span className="x-gcal-invite-date-month">{monthAbbr}</span>
          <span className="x-gcal-invite-date-day">{dayNumber}</span>
          {weekday ? <span className="x-gcal-invite-date-weekday">{weekday}</span> : null}
        </div>

        <div className="x-gcal-invite-body">
          <h3 className="x-gcal-invite-title">{title || 'Calendar event'}</h3>

          {calendarUrl ? (
            <button
              type="button"
              className="x-gcal-invite-cal-link"
              onClick={(e) => openLink(e, calendarUrl)}
            >
              View on Google Calendar
            </button>
          ) : null}

          <dl className="x-gcal-invite-details">
            {whenLabel ? (
              <div className="x-gcal-invite-detail">
                <dt>When</dt>
                <dd>{whenLabel}</dd>
              </div>
            ) : null}
            {where ? (
              <div className="x-gcal-invite-detail">
                <dt>Where</dt>
                <dd>{where}</dd>
              </div>
            ) : null}
            {who ? (
              <div className="x-gcal-invite-detail">
                <dt>Who</dt>
                <dd>{who}</dd>
              </div>
            ) : null}
          </dl>

          {!canceled ? (
            <div className="x-gcal-invite-rsvp">
              {(['yes', 'maybe', 'no'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={`x-gcal-invite-rsvp-btn x-gcal-invite-rsvp-${kind}`}
                  onClick={(e) => onRsvp(e, kind)}
                >
                  {kind === 'yes' ? 'Yes' : kind === 'maybe' ? 'Maybe' : 'No'}
                </button>
              ))}
            </div>
          ) : (
            <p className="x-gcal-invite-canceled-label">This event was canceled.</p>
          )}
        </div>
      </div>

      {startAt ? (
        <aside className="x-gcal-invite-agenda">
          <h4 className="x-gcal-invite-agenda-heading">{agendaHeading}</h4>
          {agendaEvents.length === 0 ? (
            <p className="x-gcal-invite-agenda-empty">No other events this day.</p>
          ) : (
            <div className="x-gcal-invite-agenda-list">
              {agendaEvents.map((ev) => (
                <AgendaRow key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </aside>
      ) : null}
    </div>
  )
}
