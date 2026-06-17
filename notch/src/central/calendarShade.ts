/** Persisted per calendar day — survives app refresh. */
export function calendarShadeKey(eventId: string): string {
  const day = new Date().toISOString().slice(0, 10)
  return `notch.cal-shade.${day}.${eventId}`
}

export function wasCalendarShaded(eventId: string): boolean {
  try {
    return localStorage.getItem(calendarShadeKey(eventId)) === '1'
  } catch {
    return false
  }
}

export function markCalendarShaded(eventId: string): void {
  try {
    localStorage.setItem(calendarShadeKey(eventId), '1')
  } catch {
    /* ignore */
  }
}
