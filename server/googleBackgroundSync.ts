import type { Server as SocketServer } from 'socket.io'
import { syncGmail, getLastGmailSyncAt } from './sources/gmail'
import { syncGdocs } from './sources/gdocs'
import { googleApiBlockedMessage } from './sources/googleRateLimit'

/** Gmail poll interval — matches feed poll cadence while app is open. */
export const GMAIL_INTERVAL_MS = 90_000
/** Retry sooner after a failed sync (Google blips, ECONNRESET). */
const GMAIL_RETRY_MS = 30_000
/** Docs poll interval — less frequent than inbox. */
const GDOCS_INTERVAL_MS = 5 * 60_000

let lastGmailAttemptAt = 0
let lastGdocsSyncAt = 0
let gmailInFlight = false
let gdocsInFlight = false

/** Pull Gmail when due; no-ops while Google API cooldown is active. */
export async function syncGmailIfDue(io?: SocketServer): Promise<void> {
  if (gmailInFlight || googleApiBlockedMessage()) return

  const now = Date.now()
  const lastSuccess = getLastGmailSyncAt()
  const successDue = now - lastSuccess >= GMAIL_INTERVAL_MS
  const retryDue = now - lastGmailAttemptAt >= GMAIL_RETRY_MS

  if (lastSuccess > 0 && !successDue) return
  if (lastSuccess === 0 && !retryDue && lastGmailAttemptAt > 0) return

  gmailInFlight = true
  lastGmailAttemptAt = now
  const before = lastSuccess
  try {
    const items = await syncGmail(io)
    const saved = getLastGmailSyncAt() > before
    if (items.length > 0) {
      console.log(`[gmail] background sync: ${items.length} thread(s)`)
    } else if (!saved) {
      console.warn('[gmail] background sync produced no saved threads — will retry')
    }
  } finally {
    gmailInFlight = false
  }
}

/** Pull Gmail + Docs when due; no-ops while Google API cooldown is active. */
export async function syncGoogleSourcesIfDue(io?: SocketServer): Promise<void> {
  if (googleApiBlockedMessage()) return

  const now = Date.now()
  const runGmail = now - getLastGmailSyncAt() >= GMAIL_INTERVAL_MS
  const runGdocs = now - lastGdocsSyncAt >= GDOCS_INTERVAL_MS
  if (!runGmail && !runGdocs) return

  await Promise.allSettled([
    runGmail ? syncGmailIfDue(io) : Promise.resolve(),
    runGdocs ? syncGdocsIfDue(io) : Promise.resolve()
  ])
}

async function syncGdocsIfDue(io?: SocketServer): Promise<void> {
  if (gdocsInFlight || googleApiBlockedMessage()) return

  const now = Date.now()
  if (now - lastGdocsSyncAt < GDOCS_INTERVAL_MS) return

  gdocsInFlight = true
  lastGdocsSyncAt = now
  try {
    await syncGdocs(io)
  } finally {
    gdocsInFlight = false
  }
}

/** Dedicated inbox poller — runs even when the feed tab is closed. */
export function startGmailBackgroundSync(io: SocketServer): () => void {
  void syncGmailIfDue(io)
  const timer = setInterval(() => void syncGmailIfDue(io), GMAIL_INTERVAL_MS)
  return () => clearInterval(timer)
}
