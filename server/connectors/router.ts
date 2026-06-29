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
  router.get('/', async (req, res) => {
    const customerId = String(req.query.customerId ?? '')
    if (!customerId) return res.status(400).json({ error: 'customerId required' })
    try {
      const all = await listConnectors(customerId)
      const connectors = all.map(c => ({ ...c, credentials: undefined }))
      res.json({ connectors })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // POST /api/stream/connectors — create connector
  router.post('/', async (req, res) => {
    const { customerId, type, label, credentials = {}, settings = {} } = req.body as {
      customerId: string; type: ConnectorType; label?: string
      credentials?: ConnectorCredentials; settings?: ConnectorSettings
    }
    if (!customerId || !type) return res.status(400).json({ error: 'customerId and type required' })
    try {
      const impl = getConnectorImpl(type)
      const connector = await createConnector({
        customerId, type,
        label: label ?? impl.label,
        credentials,
        settings,
      })
      res.json({ connector: { ...connector, credentials: undefined } })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // DELETE /api/stream/connectors/:id
  router.delete('/:id', async (req, res) => {
    try {
      await deleteConnector(req.params.id)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // GET /api/stream/connectors/:id/runs — sync run history
  router.get('/:id/runs', async (req, res) => {
    try {
      const runs = await listSyncRuns(req.params.id)
      res.json({ runs })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // POST /api/stream/connectors/:id/sync — trigger manual sync
  router.post('/:id/sync', async (req, res) => {
    try {
      const connector = await getConnector(req.params.id)
      if (!connector) return res.status(404).json({ error: 'Connector not found' })
      res.json({ ok: true, message: 'Sync started' })
      syncConnector(connector).catch(e => {
        console.error('[connectors] manual sync error:', (e as Error).message)
      })
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // POST /api/stream/connectors/:id/validate — validate credentials
  router.post('/:id/validate', async (req, res) => {
    try {
      const connector = await getConnector(req.params.id)
      if (!connector) return res.status(404).json({ error: 'Connector not found' })
      const impl = getConnectorImpl(connector.type)
      const result = await impl.validate(connector.credentials, connector.settings)
      res.json(result)
    } catch (e) {
      res.status(500).json({ error: (e as Error).message })
    }
  })

  // ── OAuth flows ───────────────────────────────────────────────────────────────

  // GET /api/stream/connectors/oauth/authorize?type=slack&customerId=...&connectorId=...
  router.get('/oauth/authorize', async (req, res) => {
    const { type, customerId, connectorId } = req.query as Record<string, string>
    if (!type || !customerId) return res.status(400).json({ error: 'type and customerId required' })
    try {
      const impl = getConnectorImpl(type as ConnectorType)
      if (!impl.getAuthUrl) return res.status(400).json({ error: `${type} does not use OAuth` })

      const clientId = process.env[`${type.toUpperCase()}_CLIENT_ID`] ?? ''
      const redirectUri = `${process.env.API_BASE_URL ?? ''}/api/stream/connectors/oauth/callback`
      const state = JSON.stringify({ type, customerId, connectorId })

      res.redirect(impl.getAuthUrl(clientId, redirectUri, state))
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
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
    try {
      const impl = getConnectorImpl(type)
      if (!impl.exchangeCode) return res.status(400).send(`${type} does not support code exchange`)

      const clientId = process.env[`${type.toUpperCase()}_CLIENT_ID`] ?? ''
      const clientSecret = process.env[`${type.toUpperCase()}_CLIENT_SECRET`] ?? ''
      const redirectUri = `${process.env.API_BASE_URL ?? ''}/api/stream/connectors/oauth/callback`
      const creds = await impl.exchangeCode(code, clientId, clientSecret, redirectUri)

      let id = connectorId
      if (id) {
        await updateConnectorCredentials(id, creds)
      } else {
        const connector = await createConnector({ customerId, type, label: impl.label, credentials: creds, settings: {} })
        id = connector.id
      }

      const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:3000'
      res.redirect(`${dashboardUrl}/dashboard/integrations?connected=${type}&connectorId=${id}`)
    } catch (e) {
      console.error('[connectors] OAuth callback error:', (e as Error).message)
      res.status(500).send(`OAuth failed: ${(e as Error).message}`)
    }
  })

  return router
}
