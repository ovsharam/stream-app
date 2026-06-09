/** LinkedIn messaging thread id helpers (ingest, dedupe, navigation). */

export function isSyntheticLinkedInThreadId(threadId: string): boolean {
  const tid = threadId.trim()
  return !tid || tid.startsWith('li-list-')
}

export function linkedInThreadPath(threadId: string): string {
  return `/messaging/thread/${encodeURIComponent(threadId)}/`
}
