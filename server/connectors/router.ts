import { Router } from 'express'
import {
  createConnector,
  getConnector,
  listConnectors,
  deleteConnector,
  listSyncRuns,
  updateConnectorCredentials,
} from './store'
import { getConnectorImpl, listConnectorMeta } from './registry'
import { syncConnector } from './scheduler'
import type { ConnectorCredentials, ConnectorSettings, ConnectorType } from './types'

export function connectorRouter(): Router {
  const router = Router()

  // GET /api/stream/connectors/meta — list available connector types
  router.get('/meta', (_req, res) => {
    res.json({ connectors: listConnectorMeta() })
  })

  // GET /api/stream/connectors?customerId=... — list customer's connectors
  router.get('/', (req, res) => {
    const customerId = String(req.query.customerId ?? '')
    if (!customerId) return res.status(400).json({ error: 'customerId required' })
    const connectors = listConnectors(customerId).map(c => ({
      ...c,
      credentials: undefined,  // never expose credentials to frontend
    }))
    res.json({ connectors })
  })

  // POST /api/stream/connectors — create connector
  router.post('/', (req, res) => {
    const { customerId, type, label, credentials = {}, settings = {} } = req.body as {
      customerId: string; type: ConnectorType; label?: string
      credentials?: ConnectorCredentials; settings?: ConnectorSettings
    }
    if (!customerId || !type) return res.status(400).json({ error: 'customerId and type required' })

    const impl = getConnectorImpl(type)
    const connector = createConnector({
      customerId, type,
      label: label ?? impl.label,
      credentials,
      settings,
    })
    res.json({ connector: { ...connector, credentials: undefined } })
  })

  // DELETE /api/stream/connectors/:id
  router.delete('/:id', (req, res) => {
    deleteConnector(req.params.id)
    res.json({ ok: true })
  })

  // GET /api/stream/connectors/:id/runs — sync run history
  router.get('/:id/runs', (req, res) => {
    const runs = listSyncRuns(req.params.id)
    res.json({ runs })
  })

  // POST /api/stream/connectors/:id/sync — trigger manual sync
  router.post('/:id/sync', async (req, res) => {
    const connector = getConnector(req.params.id)
    if (!connector) return res.status(404).json({ error: 'Connector not found' })

    // Start sync async — return immediately
    res.json({ ok: true, message: 'Sync started' })
    syncConnector(connector).catch(e => {
      console.error('[connectors] manual sync error:', (e as Error).message)
    })
  })

  // POST /api/stream/connectors/:id/validate — validate credentials
  router.post('/:id/validate', async (req, res) => {
    const connector = getConnector(req.params.id)
    if (!connector) return res.status(404).json({ error: 'Connector not found' })
    const impl = getConnectorImpl(connector.type)
    const result = await impl.validate(connector.credentials, connector.settings)
    res.json(result)
  })

  // ── OAuth flows ───────────────────────────────────────────────────────────────

  // GET /api/stream/connectors/oauth/authorize?type=slack&customerId=...&connectorId=...
  router.get('/oauth/authorize', (req, res) => {
    const { type, customerId, connectorId } = req.query as Record<string, string>
    if (!type || !customerId) return res.status(400).json({ error: 'type and customerId required' })

    const impl = getConnectorImpl(type as ConnectorType)
    if (!impl.getAuthUrl) return res.status(400).json({ error: `${type} does not use OAuth` })

    const clientId = process.env[`${type.toUpperCase()}_CLIENT_ID`] ?? ''
    const redirectUri = `${process.env.API_BASE_URL ?? ''}/api/stream/connectors/oauth/callback`
    const state = JSON.stringify({ type, customerId, connectorId })

    res.redirect(impl.getAuthUrl(clientId, redirectUri, state))
  })

  // GET /api/stream/connectors/oauth/callback?code=...&state=...
  router.get('/oauth/callback', async (req, res) => {
    const { code, state: stateRaw, error } = req.query as Record<string, string>
    if (error) return res.status(400).send(`OAuth error: ${error}`)
    if (!code || !stateRaw) return res.status(400).send('Missing code or state')

    let stateObj: { type: ConnectorType; customerId: string; connectorId?: string }
    try {
      stateObj = JSON.parse(stateRaw)
    } catch {
      return res.status(400).send('Invalid state')
    }

    const { type, customerId, connectorId } = stateObj
    const impl = getConnectorImpl(type)
    if (!impl.exchangeCode) return res.status(400).send(`${type} does not support code exchange`)

    try {
      const clientId = process.env[`${type.toUpperCase()}_CLIENT_ID`] ?? ''
      const clientSecret = process.env[`${type.toUpperCase()}_CLIENT_SECRET`] ?? ''
      const redirectUri = `${process.env.API_BASE_URL ?? ''}/api/stream/connectors/oauth/callback`
      const creds = await impl.exchangeCode(code, clientId, clientSecret, redirectUri)

      let id = connectorId
      if (id) {
        // Update existing connector credentials
        updateConnectorCredentials(id, creds)
      } else {
        // Create new connector
        const connector = createConnector({ customerId, type, label: impl.label, credentials: creds, settings: {} })
        id = connector.id
      }

      // Redirect to integrations page on success
      const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
      res.redirect(`${dashboardUrl}/dashboard/integrations?connected=${type}&connectorId=${id}`)
    } catch (e) {
      console.error('[connectors] OAuth callback error:', (e as Error).message)
      res.status(500).send(`OAuth failed: ${(e as Error).message}`)
    }
  })

  return router
}
