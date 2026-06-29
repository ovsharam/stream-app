/**
 * Runs all active connectors on a schedule (every 6 hours by default).
 * Also exposes `syncConnector` for on-demand triggering via the router.
 */

import cron from 'node-cron'
import {
  listActiveConnectors,
  updateConnectorStatus,
  updateConnectorCredentials,
  createSyncRun,
  completeSyncRun,
} from './store'
import { getConnectorImpl } from './registry'
import { runConnectorPipeline } from './pipeline'
import type { ConnectorConfig } from './types'

const SYNC_INTERVAL = '0 */6 * * *'  // every 6 hours

export async function syncConnector(connector: ConnectorConfig): Promise<void> {
  const impl = getConnectorImpl(connector.type)
  const run = createSyncRun(connector.id, connector.customerId)

  console.log(`[connectors] starting sync: ${connector.label} (${connector.id})`)
  updateConnectorStatus(connector.id, 'active')

  try {
    let creds = connector.credentials

    // Refresh token if expired (with 5-min buffer)
    if (
      creds.expiresAt &&
      creds.expiresAt < Date.now() + 5 * 60 * 1000 &&
      impl.refreshAccessToken
    ) {
      const clientId = process.env[`${connector.type.toUpperCase()}_CLIENT_ID`] ?? ''
      const clientSecret = process.env[`${connector.type.toUpperCase()}_CLIENT_SECRET`] ?? ''
      const refreshed = await impl.refreshAccessToken(creds, clientId, clientSecret)
      creds = { ...creds, ...refreshed }
      updateConnectorCredentials(connector.id, creds)
    }

    const chunks = impl.fetchChunks(creds, connector.settings, connector.lastSyncAt)
    const result = await runConnectorPipeline(connector.customerId, connector.label, chunks)

    completeSyncRun(run.id, {
      chunksProcessed: result.chunksProcessed,
      nodesExtracted: result.nodesExtracted,
    })
    updateConnectorStatus(connector.id, 'active', { lastSyncAt: Date.now() })
    console.log(`[connectors] done: ${connector.label} — ${result.chunksProcessed} chunks, ${result.nodesExtracted} nodes`)
  } catch (err) {
    const errorMsg = (err as Error).message
    console.error(`[connectors] error syncing ${connector.label}:`, errorMsg)
    completeSyncRun(run.id, { chunksProcessed: 0, nodesExtracted: 0, error: errorMsg })
    updateConnectorStatus(connector.id, 'error', { errorMsg })
  }
}

async function runAllActive(): Promise<void> {
  const connectors = listActiveConnectors()
  if (connectors.length === 0) return
  console.log(`[connectors] scheduled sync: ${connectors.length} active connector(s)`)
  await Promise.allSettled(connectors.map(syncConnector))
}

let started = false
export function startScheduler(): void {
  if (started) return
  started = true
  cron.schedule(SYNC_INTERVAL, () => {
    runAllActive().catch(e => console.error('[connectors] scheduler error:', e))
  })
  console.log('[connectors] scheduler started, syncing every 6h')
}
