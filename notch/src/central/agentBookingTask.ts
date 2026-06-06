import type { AgentProposal, BookingTaskPayload } from '@shared/agent-proposal'

export function formatBookingTaskPreview(task: BookingTaskPayload): string {
  if (task.composeCommand?.trim()) return task.composeCommand.trim()

  const notes = task.notes ?? `LinkedIn thread ${task.sourceThreadId}`
  if (task.action === 'cancel') {
    return `@calcom cancel: ${task.originalBookingUid ?? '?'} / ${notes}`
  }
  if (task.action === 'reschedule') {
    const start = task.proposedTimes?.[0] ?? 'auto'
    return `@calcom reschedule: ${task.originalBookingUid ?? '?'} / ${start} / ${notes}`
  }
  const slug = task.eventTypeSlug ?? '30min'
  const email = task.inviteeEmails[0] ?? '<email>'
  const name = task.inviteeName ?? email
  const start = task.proposedTimes?.[0] ?? 'auto'
  return `@calcom book: ${slug} / ${email} / ${name} / ${start} / ${notes}`
}

export function bookingTaskFields(task: BookingTaskPayload, proposal: AgentProposal): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Action', value: task.action },
    { label: 'Compose', value: formatBookingTaskPreview(task) }
  ]
  if (task.inviteeEmails.length) {
    rows.push({ label: 'Invitee', value: task.inviteeEmails.join(', ') })
  } else if (proposal.inviteeResolution.method !== 'unresolved') {
    rows.push({ label: 'Invitee', value: proposal.inviteeResolution.emails.join(', ') || '—' })
  }
  if (task.originalBookingUid) {
    rows.push({ label: 'Booking UID', value: task.originalBookingUid })
  } else if (proposal.inviteeResolution.bookingUid) {
    rows.push({ label: 'Booking UID', value: proposal.inviteeResolution.bookingUid })
  }
  if (task.proposedTimes?.length) {
    rows.push({
      label: 'Proposed time',
      value: `${task.proposedTimes.join(', ')}${task.proposedTimeSource ? ` (${task.proposedTimeSource})` : ''}`
    })
  }
  if (task.matchedBookingStart) {
    rows.push({
      label: 'Existing booking',
      value: new Date(task.matchedBookingStart).toLocaleString()
    })
  }
  if (task.eventTypeSlug) rows.push({ label: 'Event type', value: task.eventTypeSlug })
  if (task.durationMin) rows.push({ label: 'Duration', value: `${task.durationMin} min` })
  if (task.notes) rows.push({ label: 'Notes', value: task.notes })
  if (proposal.inviteeResolution.note) {
    rows.push({ label: 'Invitee lookup', value: proposal.inviteeResolution.note })
  }
  return rows
}

export function bookingTaskWarnings(task: BookingTaskPayload, proposal: AgentProposal): string[] {
  const warnings: string[] = []
  if (task.action === 'book' && !task.inviteeEmails.length && proposal.inviteeResolution.method === 'unresolved') {
    warnings.push('Invitee email unresolved — add email before approving.')
  }
  if (
    (task.action === 'reschedule' || task.action === 'cancel') &&
    !task.originalBookingUid &&
    !proposal.inviteeResolution.bookingUid
  ) {
    warnings.push('Original booking UID unknown — sync Cal.com or match prior booking by name.')
  }
  if (task.action === 'reschedule' && (!task.proposedTimes?.length || task.proposedTimes[0] === 'auto')) {
    warnings.push('Proposed time not found in Cal.com or calendar — confirm with Martin or check sync.')
  }
  return warnings
}
