import type { Server as SocketServer } from 'socket.io'
import { syncCalcom } from './sources/calcom'
import { syncClaude } from './sources/claude'
import { syncDiscord } from './sources/discord'
import { syncGithub } from './sources/github'
import { syncGong } from './sources/gong'
import { syncMonday } from './sources/monday'
import { syncPerplexity } from './sources/perplexity'
import { syncSlack } from './sources/slack'
import { syncX } from './sources/x'
import { ingestRecentStream } from './kb/pipeline'

const POLL_MS = 90_000
let lastPollAt = 0
let pollInFlight = false

/** Throttled background ingest while the feed is open — keeps stream fresh without hammering APIs. */
export function pollIntegrationsIfDue(io?: SocketServer): void {
  const now = Date.now()
  if (pollInFlight || now - lastPollAt < POLL_MS) return
  lastPollAt = now
  pollInFlight = true

  void Promise.allSettled([
    syncSlack(io),
    syncX(io),
    syncMonday(io),
    syncDiscord(io),
    syncGithub(io),
    syncGong(io),
    syncClaude(io),
    syncPerplexity(io),
    syncCalcom(io)
  ])
    .then(() => {
      try {
        ingestRecentStream(120)
      } catch {
        /* optional */
      }
    })
    .finally(() => {
      pollInFlight = false
    })
}
