import type { Server as SocketServer } from 'socket.io'
import { syncGmail } from './sources/gmail'
import { syncGdocs } from './sources/gdocs'
import { googleApiBlockedMessage } from './sources/googleRateLimit'

/** Gmail poll interval — conservative to avoid Google user-rate limits. */
const GMAIL_INTERVAL_MS = 3 * 60_000
/** Docs poll interval — less frequent than inbox. */
const GDOCS_INTERVAL_MS = 5 * 60_000

let lastGmailSyncAt = 0
let lastGdocsSyncAt = 0
let inFlight = false

/** Pull Gmail + Docs when due; no-ops while Google API cooldown is active. */
export async function syncGoogleSourcesIfDue(io?: SocketServer): Promise<void> {
  if (inFlight || googleApiBlockedMessage()) return

  const now = Date.now()
  const runGmail = now - lastGmailSyncAt >= GMAIL_INTERVAL_MS
  const runGdocs = now - lastGdocsSyncAt >= GDOCS_INTERVAL_MS
  if (!runGmail && !runGdocs) return

  inFlight = true
  try {
    if (runGmail) {
      lastGmailSyncAt = Date.now()
      await syncGmail(io)
    }
    if (runGdocs) {
      lastGdocsSyncAt = Date.now()
      await syncGdocs(io)
    }
  } finally {
    inFlight = false
  }
}
