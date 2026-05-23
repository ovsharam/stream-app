import { Router } from 'express'
import { randomBytes } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import { getRecentItems, updateItemFlags } from './db'
import { getConnections, setNested, getNested } from './store'
import { streamItemToApi } from '../shared/serialize'
import {
  getGmailAuthUrl,
  handleGmailCallback,
  syncGmail,
  isGmailConfigured,
  isGmailConnected
} from './sources/gmail'
import {
  getSlackAuthUrl,
  handleSlackCallback,
  syncSlack,
  isSlackConfigured,
  isSlackConnected
} from './sources/slack'
import {
  getXAuthUrl,
  handleXCallback,
  connectXWithBearerToken,
  syncX,
  isXConfigured,
  isXConnected
} from './sources/x'
import { connectPerplexity, askPerplexity, isPerplexityConnected } from './sources/perplexity'
import { normalizeNote } from './normalizer'
import { upsertItem } from './db'
import type { StreamItem } from '../shared/types'
import {
  getActiveContext,
  searchGraph,
  listCases,
  getCase,
  getPattern,
  setActiveCase,
  getSignalsForCase
} from './graph/store'
import { syncGmailItemsToGraph } from './graph/gmail-ingest'
import { scoreFdeDecision } from './scoring/fde-scorer'
import {
  setBrowserContext,
  getBrowserContext,
  inferEntityType,
  inferEntityHint,
  type BrowserContextPayload
} from './browser/context'
import { fetchGmailThreads } from './sources/gmail'
import { buildClusterContext, searchCluster, assistCluster } from './cluster/service'
import { getCentralStream } from './cluster/stream'

function serializeContext(ctx: ReturnType<typeof getActiveContext>) {
  return {
    ...ctx,
    activeCase: ctx.activeCase
      ? { ...ctx.activeCase, updatedAt: ctx.activeCase.updatedAt.toISOString() }
      : null,
    recentSignals: ctx.recentSignals.map((s) => ({
      ...s,
      extractedAt: s.extractedAt.toISOString()
    }))
  }
}

export function createRouter(io?: SocketServer): Router {
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() })
  })

  router.get('/stream', (req, res) => {
    const limit = parseInt(String(req.query.limit ?? '100'), 10)
    const source = req.query.source as string | undefined
    const items = getRecentItems(limit, source as StreamItem['source'] | undefined)
    res.json(items.map(streamItemToApi))
  })

  router.get('/connections', (_req, res) => {
    const demo = process.env.DEMO_MODE === '1'
    res.json({
      connections: getConnections(),
      configured: {
        gmail: isGmailConfigured() || demo,
        slack: isSlackConfigured() || demo,
        x: isXConfigured() || demo,
        perplexity: true
      },
      connected: demo
        ? { gmail: true, slack: true, x: true, perplexity: true }
        : {
            gmail: isGmailConnected(),
            slack: isSlackConnected(),
            x: isXConnected(),
            perplexity: isPerplexityConnected()
          },
      onboardingComplete:
        demo || (getNested<boolean>(['preferences', 'onboardingComplete']) ?? false)
    })
  })

  router.post('/connections/onboarding-complete', (_req, res) => {
    setNested(['preferences', 'onboardingComplete'], true)
    res.json({ ok: true })
  })

  router.patch('/stream/:id', (req, res) => {
    const updated = updateItemFlags(req.params.id, {
      isUnread: req.body.isUnread,
      isStarred: req.body.isStarred
    })
    if (!updated) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    io?.emit('stream:update', streamItemToApi(updated))
    res.json(streamItemToApi(updated))
  })

  // Gmail auth
  router.get('/auth/gmail', (_req, res) => {
    if (!isGmailConfigured()) {
      res.status(400).json({ error: 'Gmail OAuth not configured' })
      return
    }
    res.json({ url: getGmailAuthUrl() })
  })

  router.get('/auth/gmail/callback', async (req, res) => {
    const code = String(req.query.code ?? '')
    try {
      await handleGmailCallback(code)
      await syncGmail(io)
      res.send(successHtml('Gmail connected'))
    } catch (err) {
      res.status(500).send(errorHtml(String(err)))
    }
  })

  router.post('/auth/gmail/sync', async (_req, res) => {
    const items = await syncGmail(io)
    res.json({ count: items.length })
  })

  // Slack auth
  router.get('/auth/slack', (_req, res) => {
    if (!isSlackConfigured()) {
      res.status(400).json({ error: 'Slack OAuth not configured' })
      return
    }
    res.json({ url: getSlackAuthUrl() })
  })

  router.get('/auth/slack/callback', async (req, res) => {
    const code = String(req.query.code ?? '')
    try {
      await handleSlackCallback(code)
      await syncSlack(io)
      res.send(successHtml('Slack connected'))
    } catch (err) {
      res.status(500).send(errorHtml(String(err)))
    }
  })

  router.post('/auth/slack/sync', async (_req, res) => {
    const items = await syncSlack(io)
    res.json({ count: items.length })
  })

  // X auth
  router.get('/auth/x', (_req, res) => {
    const state = randomBytes(16).toString('hex')
    const { url } = getXAuthUrl(state)
    res.json({ url, state })
  })

  router.get('/auth/x/callback', async (req, res) => {
    const code = String(req.query.code ?? '')
    const state = String(req.query.state ?? '')
    try {
      await handleXCallback(code, state)
      await syncX(io)
      res.send(successHtml('X connected'))
    } catch (err) {
      res.status(500).send(errorHtml(String(err)))
    }
  })

  router.post('/auth/x/token', async (req, res) => {
    const { token } = req.body as { token?: string }
    if (!token) {
      res.status(400).json({ error: 'Token required' })
      return
    }
    await connectXWithBearerToken(token)
    const items = await syncX(io)
    res.json({ ok: true, count: items.length })
  })

  router.post('/auth/x/sync', async (_req, res) => {
    const items = await syncX(io)
    res.json({ count: items.length })
  })

  // Perplexity
  router.post('/auth/perplexity', (req, res) => {
    const { apiKey } = req.body as { apiKey?: string }
    if (!apiKey) {
      res.status(400).json({ error: 'API key required' })
      return
    }
    connectPerplexity(apiKey)
    res.json({ ok: true })
  })

  router.post('/ai/query', async (req, res) => {
    const { query, systemPrompt } = req.body as {
      query?: string
      systemPrompt?: string
    }
    if (!query || !systemPrompt) {
      res.status(400).json({ error: 'query and systemPrompt required' })
      return
    }
    try {
      const item = await askPerplexity(query, systemPrompt, io)
      res.json(streamItemToApi(item))
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.post('/notes', (req, res) => {
    const { text, title } = req.body as { text?: string; title?: string }
    if (!text) {
      res.status(400).json({ error: 'text required' })
      return
    }
    const item = normalizeNote(text, title)
    upsertItem(item)
    io?.emit('stream:item', streamItemToApi(item))
    res.json(streamItemToApi(item))
  })

  router.post('/sync/all', async (_req, res) => {
    const results = await Promise.allSettled([
      syncGmail(io),
      syncSlack(io),
      syncX(io)
    ])
    res.json({
      gmail: results[0].status === 'fulfilled' ? results[0].value.length : 0,
      slack: results[1].status === 'fulfilled' ? results[1].value.length : 0,
      x: results[2].status === 'fulfilled' ? results[2].value.length : 0
    })
  })

  router.post('/webhooks/gmail', async (_req, res) => {
    await syncGmail(io)
    res.status(200).send('OK')
  })

  router.get('/stream/poll', (req, res) => {
    const since = parseInt(String(req.query.since ?? '0'), 10)
    const items = getRecentItems(100)
    const fresh = items.filter((i) => i.timestamp.getTime() > since)
    res.json(fresh.map(streamItemToApi))
  })

  // Knowledge graph (AE/FDE copilot)
  router.get('/graph/context', (_req, res) => {
    res.json(serializeContext(getActiveContext()))
  })

  router.get('/graph/search', (req, res) => {
    const q = String(req.query.q ?? '')
    const limit = parseInt(String(req.query.limit ?? '12'), 10)
    res.json(searchGraph(q, limit))
  })

  router.get('/graph/cases', (_req, res) => {
    res.json(
      listCases().map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))
    )
  })

  router.get('/graph/cases/:id', (req, res) => {
    const c = getCase(req.params.id)
    if (!c) {
      res.status(404).json({ error: 'Case not found' })
      return
    }
    res.json({ ...c, updatedAt: c.updatedAt.toISOString() })
  })

  router.post('/graph/cases/:id/active', (req, res) => {
    const c = setActiveCase(req.params.id)
    if (!c) {
      res.status(404).json({ error: 'Case not found' })
      return
    }
    res.json(serializeContext(getActiveContext()))
  })

  router.get('/graph/patterns/:id', (req, res) => {
    const p = getPattern(req.params.id)
    if (!p) {
      res.status(404).json({ error: 'Pattern not found' })
      return
    }
    res.json(p)
  })

  router.get('/graph/cases/:id/score', (req, res) => {
    const c = getCase(req.params.id)
    if (!c) {
      res.status(404).json({ error: 'Case not found' })
      return
    }
    const signals = getSignalsForCase(c.id)
    res.json(scoreFdeDecision(c, signals))
  })

  router.post('/graph/gmail/sync', async (_req, res) => {
    try {
      const ctx = getActiveContext()
      const caseId = ctx.activeCase?.id
      if (!caseId) {
        res.status(400).json({ error: 'No active case' })
        return
      }
      let threads
      try {
        threads = await fetchGmailThreads(30)
      } catch {
        res.status(401).json({ error: 'Gmail not connected — complete OAuth first' })
        return
      }
      const signals = syncGmailItemsToGraph(caseId, threads)
      res.json({ items: threads.length, signals: signals.length, signalIds: signals.map((s) => s.id) })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.post('/browser/context', (req, res) => {
    const body = req.body as Partial<BrowserContextPayload>
    if (!body.url) {
      res.status(400).json({ error: 'url required' })
      return
    }
    const ctx: BrowserContextPayload = {
      url: body.url,
      hostname: body.hostname ?? new URL(body.url).hostname,
      title: body.title ?? '',
      entityType: body.entityType ?? inferEntityType(body.url),
      entityHint: body.entityHint ?? inferEntityHint(body.url),
      selectedText: body.selectedText?.slice(0, 500),
      timestamp: new Date().toISOString()
    }
    setBrowserContext(ctx)
    res.json({ ok: true, scope: serializeContext(getActiveContext()).scope })
  })

  router.get('/browser/context', (_req, res) => {
    res.json(getBrowserContext())
  })

  // Cluster API — shared context between central dashboard + mobile droplet
  router.get('/cluster/context', (_req, res) => {
    res.json(buildClusterContext())
  })

  router.get('/cluster/stream', (_req, res) => {
    res.json(getCentralStream())
  })

  router.get('/cluster/search', (req, res) => {
    const q = String(req.query.q ?? '')
    res.json(searchCluster(q))
  })

  router.post('/cluster/assist', (req, res) => {
    const query = String(req.body.query ?? '')
    const liveContext = req.body.liveContext as string | undefined
    res.json(assistCluster(query, liveContext))
  })

  return router
}

function successHtml(source: string): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#f0f0f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>${source}</h2><p>You can close this window and return to STREAM.</p></div></body></html>`
}

function errorHtml(msg: string): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#EA4335;font-family:system-ui;padding:2rem"><h2>Connection failed</h2><p>${msg}</p></body></html>`
}
