import { Router } from 'express'
import { randomBytes } from 'crypto'
import type { Server as SocketServer } from 'socket.io'
import { getRecentItems, updateItemFlags } from './db'
import { getConnections, setConnection, setNested, getNested } from './store'
import { streamItemToApi } from '../shared/serialize'
import {
  getGmailAuthUrl,
  handleGmailCallback,
  syncGmail,
  isGmailConfigured,
  isGmailConnected,
  getGmailThreadContext,
  getLastGmailError,
  googleApiNeedsEnable,
  googleApiEnableUrl
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
import {
  connectMondayWithToken,
  syncMonday,
  isMondayConfigured,
  isMondayConnected,
  getMondayItemContext,
  createMondayComment,
  moveMondayItemStatus,
  createMondayItemOnBoard,
  getMondayCreateTarget,
  listMondayBoardTargets,
  getMondayAccount
} from './sources/monday'
import { runMondayNaturalLanguage } from './cluster/mondayExecute'
import {
  connectDiscordToken,
  syncDiscord,
  isDiscordConfigured,
  isDiscordConnected
} from './sources/discord'
import { connectPerplexity, askPerplexity, isPerplexityConnected } from './sources/perplexity'
import { registerIntegrationExecutors } from './integrations/executors'
import { runIntegrationAction } from './integrations/registry'
import { parseComposeCommand, COMPOSE_HELP } from '../shared/compose'
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
import {
  listGmailAccounts,
  updateGmailAccount,
  removeGmailAccount,
  toPublicAccount
} from './sources/gmailAccounts'
import { buildClusterContext, searchCluster } from './cluster/service'
import { buildMobileContext, mobileAssist } from './mobile/service'
import { startSimCall, stopSimCall } from './sim/engine'
import { getCentralStream } from './cluster/stream'
import type { ClusterThread } from '../shared/cluster'
import { readSessionId, getSessionId } from './session'
import { runWithSession } from './request-context'
import { fetchCalendarEvents, getCachedCalendarEvents, syncCalendar, getLastCalendarError, calendarNeedsReconnect, listGoogleCalendars, setEnabledCalendarIds } from './sources/calendar'

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
  registerIntegrationExecutors()
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

  router.get('/connections', async (_req, res) => {
    const demo = process.env.DEMO_MODE === '1'
    const gmailError = getLastGmailError()
    const calendarError = getLastCalendarError()
    const gmailConnected = demo || (await isGmailConnected())
    res.json({
      connections: getConnections(),
      configured: {
        gmail: isGmailConfigured() || demo,
        slack: isSlackConfigured() || demo,
        x: isXConfigured() || demo,
        monday: isMondayConfigured() || demo,
        discord: isDiscordConfigured() || demo,
        perplexity: true
      },
      connected: demo
        ? { gmail: true, slack: true, x: true, monday: true, discord: true, perplexity: true }
        : {
            gmail: gmailConnected,
            slack: isSlackConnected(),
            x: isXConnected(),
            monday: isMondayConnected(),
            discord: isDiscordConnected(),
            perplexity: isPerplexityConnected()
          },
      syncErrors: demo
        ? {}
        : {
            gmail: gmailError ?? undefined,
            calendar: calendarError ?? undefined
          },
      googleApiEnable: demo
        ? {}
        : {
            gmail: googleApiNeedsEnable(gmailError) ? googleApiEnableUrl(gmailError) : undefined,
            calendar: googleApiNeedsEnable(calendarError) ? googleApiEnableUrl(calendarError) : undefined
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
  router.get('/auth/gmail', (req, res) => {
    const simMode = process.env.DEMO_MODE === '1' || process.env.SIMULATION_MODE === 'true'
    if (simMode) {
      setConnection('gmail', true)
      res.json({ url: '', simulated: true })
      return
    }
    if (!isGmailConfigured()) {
      res.status(400).json({ error: 'Gmail OAuth not configured' })
      return
    }
    const sessionId = readSessionId(req) ?? getSessionId(req, res)
    const addAccount = req.query.addAccount === '1' || req.query.addAccount === 'true'
    res.json({ url: getGmailAuthUrl(sessionId, addAccount) })
  })

  router.get('/auth/gmail/callback', async (req, res) => {
    const code = String(req.query.code ?? '')
    const sessionId =
      String(req.query.state ?? '') || readSessionId(req) || getSessionId(req, res)
    try {
      await runWithSession(sessionId, async () => {
        await handleGmailCallback(code, sessionId)
        await syncGmail(io)
      })
      res.send(successHtml('Gmail connected — you can close this tab and return to Notch.'))
    } catch (err) {
      res.status(500).send(errorHtml(String(err)))
    }
  })

  router.post('/auth/gmail/sync', async (_req, res) => {
    const items = await syncGmail(io)
    const error = getLastGmailError()
    res.json({
      count: items.length,
      error: error ?? undefined,
      needsApiEnable: googleApiNeedsEnable(error),
      enableUrl: googleApiEnableUrl(error) ?? undefined
    })
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

  // Monday
  router.post('/auth/monday/token', async (req, res) => {
    const { token } = req.body as { token?: string }
    if (!token) {
      res.status(400).json({ error: 'Token required' })
      return
    }
    try {
      await connectMondayWithToken(token)
      const items = await syncMonday(io)
      res.json({ ok: true, count: items.length })
    } catch (err) {
      setConnection('monday', false)
      res.status(401).json({ error: String(err) })
    }
  })

  router.post('/auth/monday/sync', async (_req, res) => {
    const items = await syncMonday(io)
    res.json({ count: items.length })
  })

  // Discord
  router.post('/auth/discord/token', async (req, res) => {
    const { token, channelIds } = req.body as { token?: string; channelIds?: string[] }
    if (!token || !Array.isArray(channelIds) || channelIds.length === 0) {
      res.status(400).json({ error: 'token and channelIds[] required' })
      return
    }
    await connectDiscordToken(token, channelIds.filter(Boolean))
    const items = await syncDiscord(io)
    res.json({ ok: true, count: items.length })
  })

  router.post('/auth/discord/sync', async (_req, res) => {
    const items = await syncDiscord(io)
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
      syncX(io),
      syncMonday(io),
      syncDiscord(io),
      syncCalendar()
    ])
    res.json({
      gmail: results[0].status === 'fulfilled' ? results[0].value.length : 0,
      slack: results[1].status === 'fulfilled' ? results[1].value.length : 0,
      x: results[2].status === 'fulfilled' ? results[2].value.length : 0,
      monday: results[3].status === 'fulfilled' ? results[3].value.length : 0,
      discord: results[4].status === 'fulfilled' ? results[4].value.length : 0,
      calendar: results[5].status === 'fulfilled' ? results[5].value.length : 0
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
        const items = await syncGmail()
        threads = items
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

  router.get('/cluster/stream', (req, res) => {
    const role = String(req.query.role ?? 'ae') as 'ae' | 'am' | 'csm' | 'fde'
    res.json(getCentralStream(role))
  })

  router.get('/cluster/calendar', async (_req, res) => {
    const connected = await isGmailConnected()
    if (!connected) {
      res.json({ events: [], connected: false })
      return
    }
    try {
      const events = await syncCalendar()
      const error = getLastCalendarError()
      res.json({
        events,
        connected: true,
        error: error ?? undefined,
        needsReconnect: calendarNeedsReconnect(error)
      })
    } catch (err) {
      const message = String(err)
      res.json({
        events: [],
        connected: true,
        error: message,
        needsReconnect: calendarNeedsReconnect(message)
      })
    }
  })

  router.get('/cluster/calendars', async (_req, res) => {
    if (!(await isGmailConnected())) {
      res.json({ calendars: [], error: 'Connect Gmail first' })
      return
    }
    try {
      const calendars = await listGoogleCalendars()
      res.json({ calendars })
    } catch (err) {
      res.json({ calendars: [], error: String(err) })
    }
  })

  router.patch('/cluster/calendars', async (req, res) => {
    if (!(await isGmailConnected())) {
      res.status(400).json({ error: 'Connect Gmail first' })
      return
    }
    const calendarIds = (req.body as { calendarIds?: string[] }).calendarIds
    if (!Array.isArray(calendarIds)) {
      res.status(400).json({ error: 'calendarIds array required' })
      return
    }
    setEnabledCalendarIds(calendarIds.filter((id) => typeof id === 'string' && id.trim()))
    await syncCalendar()
    res.json({ ok: true, calendars: await listGoogleCalendars() })
  })

  router.get('/cluster/gmail/accounts', async (_req, res) => {
    const accounts = (await listGmailAccounts()).map(toPublicAccount)
    res.json({ accounts })
  })

  router.patch('/cluster/gmail/accounts/:accountId', async (req, res) => {
    const accountId = req.params.accountId
    const body = req.body as { feedEnabled?: boolean; calendarEnabled?: boolean }
    const accounts = (await updateGmailAccount(accountId, body)).map(toPublicAccount)
    await syncGmail(io)
    res.json({ ok: true, accounts })
  })

  router.delete('/cluster/gmail/accounts/:accountId', async (req, res) => {
    const accountId = req.params.accountId
    const accounts = (await removeGmailAccount(accountId)).map(toPublicAccount)
    await syncCalendar()
    res.json({ ok: true, accounts })
  })

  router.get('/cluster/monday/account', async (_req, res) => {
    if (!isMondayConnected()) {
      res.json({ account: null })
      return
    }
    try {
      const account = await getMondayAccount()
      res.json({ account })
    } catch (err) {
      res.json({ account: null, error: String(err) })
    }
  })

  router.get('/cluster/thread', async (req, res) => {
    const itemId = String(req.query.itemId ?? '')
    const day = String(req.query.day ?? '')
    if (!itemId) {
      res.status(400).json({ error: 'itemId required' })
      return
    }

    if (itemId.startsWith('gmail-')) {
      try {
        const connected = await isGmailConnected()
        const ctx = await getGmailThreadContext({ streamItemId: itemId })
        if (ctx) {
          const [first, ...rest] = ctx.messages
          const payload: ClusterThread = {
            itemId,
            itemTitle: ctx.subject,
            day: day || new Date().toISOString().slice(0, 10),
            source: 'gmail',
            threadId: ctx.threadId,
            accountId: ctx.accountId,
            taskUrl: ctx.gmailUrl,
            canExecute: connected,
            parent: first
              ? {
                  id: first.id,
                  ts: first.ts,
                  actor: first.actor,
                  body: first.body,
                  source: 'gmail'
                }
              : null,
            updates: rest.map((m) => ({
              id: m.id,
              ts: m.ts,
              actor: m.actor,
              body: m.body,
              source: 'gmail'
            }))
          }
          res.json(payload)
          return
        }
      } catch (err) {
        console.error('[gmail] thread context failed:', err)
      }
    }

    const canExecute = isMondayConnected()

    if (canExecute) {
      try {
        const live = await getMondayItemContext(itemId)
        if (live) {
          const effectiveDay = day || new Date().toISOString().slice(0, 10)
          const dayStart = new Date(`${effectiveDay}T00:00:00`)
          const dayEnd = new Date(`${effectiveDay}T23:59:59.999`)
          const sorted = [...live.updates].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
          const sameDay = sorted.filter((u) => {
            const ts = new Date(u.createdAt).getTime()
            return ts >= dayStart.getTime() && ts <= dayEnd.getTime()
          })
          const threadUpdates = sameDay.length > 0 ? sameDay : sorted
          const first = threadUpdates[0]
          const rest = threadUpdates.slice(1)
          const taskUrl = `https://monday.com/boards/${live.boardId}/pulses/${itemId}`

          const payload: ClusterThread = {
            itemId,
            itemTitle: live.itemTitle,
            day: effectiveDay,
            boardId: live.boardId,
            boardName: live.boardName,
            taskUrl,
            statusColumnId: live.statusColumnId,
            currentStatus: live.currentStatus,
            statusOptions: live.statusOptions,
            canExecute: true,
            parent: first
              ? {
                  id: first.id,
                  ts: new Date(first.createdAt).getTime(),
                  actor: first.creatorName,
                  body: first.body,
                  source: 'monday'
                }
              : null,
            updates: rest.map((u) => ({
              id: u.id,
              ts: new Date(u.createdAt).getTime(),
              actor: u.creatorName,
              body: u.body,
              source: 'monday'
            }))
          }
          res.json(payload)
          return
        }
      } catch (err) {
        console.error('[monday] thread context failed:', err)
      }
    }

    const mondayItems = getRecentItems(500, 'monday').filter(
      (item) => String(item.metadata?.itemId ?? '') === itemId
    )
    if (mondayItems.length === 0) {
      if (canExecute) {
        try {
          const live = await getMondayItemContext(itemId)
          if (live) {
            const effectiveDay = day || new Date().toISOString().slice(0, 10)
            const sorted = [...live.updates].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )
            const first = sorted[0]
            const rest = sorted.slice(1)
            res.json({
              itemId,
              itemTitle: live.itemTitle,
              day: effectiveDay,
              boardId: live.boardId,
              boardName: live.boardName,
              taskUrl: `https://monday.com/boards/${live.boardId}/pulses/${itemId}`,
              statusColumnId: live.statusColumnId,
              currentStatus: live.currentStatus,
              statusOptions: live.statusOptions,
              canExecute: true,
              parent: first
                ? {
                    id: first.id,
                    ts: new Date(first.createdAt).getTime(),
                    actor: first.creatorName,
                    body: first.body,
                    source: 'monday'
                  }
                : null,
              updates: rest.map((u) => ({
                id: u.id,
                ts: new Date(u.createdAt).getTime(),
                actor: u.creatorName,
                body: u.body,
                source: 'monday'
              }))
            } satisfies ClusterThread)
            return
          }
        } catch (err) {
          console.error('[monday] live thread fallback failed:', err)
        }
      }

      const empty: ClusterThread = {
        itemId,
        itemTitle: 'Monday task',
        day: day || new Date().toISOString().slice(0, 10),
        canExecute,
        parent: null,
        updates: []
      }
      res.json(empty)
      return
    }

    const effectiveDay = day || new Date(mondayItems[0].timestamp).toISOString().slice(0, 10)
    const sameDay = mondayItems
      .filter((item) => new Date(item.timestamp).toISOString().slice(0, 10) === effectiveDay)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const first = sameDay[0]
    const rest = sameDay.slice(1)
    const boardId = String(first.metadata?.boardId ?? '')
    const accountSlug = String(first.metadata?.accountSlug ?? '')
    const taskUrl = boardId
      ? `https://${accountSlug || 'monday'}.monday.com/boards/${boardId}/pulses/${itemId}`
      : undefined

    const payload: ClusterThread = {
      itemId,
      itemTitle: String(first.metadata?.itemName ?? first.title ?? 'Monday task'),
      day: effectiveDay,
      boardId: boardId || undefined,
      boardName: String(first.metadata?.boardName ?? ''),
      taskUrl,
      canExecute,
      parent: {
        id: first.id,
        ts: first.timestamp.getTime(),
        actor: first.sender.name,
        body: first.body,
        source: 'monday'
      },
      updates: rest.map((item) => ({
        id: item.id,
        ts: item.timestamp.getTime(),
        actor: item.sender.name,
        body: item.body,
        source: 'monday'
      }))
    }

    if (canExecute) {
      try {
        const live = await getMondayItemContext(itemId)
        if (live) {
          payload.boardId = live.boardId
          payload.boardName = live.boardName
          payload.itemTitle = live.itemTitle
          payload.statusColumnId = live.statusColumnId
          payload.currentStatus = live.currentStatus
          payload.statusOptions = live.statusOptions
          payload.taskUrl = `https://monday.com/boards/${live.boardId}/pulses/${itemId}`
        }
      } catch (err) {
        console.error('[monday] enrich thread failed:', err)
      }
    }

    res.json(payload)
  })

  router.post('/cluster/monday/comment', async (req, res) => {
    const itemId = String(req.body.itemId ?? '')
    const body = String(req.body.body ?? '')
    if (!itemId || !body.trim()) {
      res.status(400).json({ error: 'itemId and body required' })
      return
    }
    if (!isMondayConnected()) {
      res.status(401).json({ error: 'Monday not connected' })
      return
    }
    try {
      const result = await createMondayComment(itemId, body)
      await syncMonday(io)
      res.json({ ok: true, updateId: result.id })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.post('/cluster/monday/move', async (req, res) => {
    const itemId = String(req.body.itemId ?? '')
    const boardId = String(req.body.boardId ?? '')
    const columnId = String(req.body.columnId ?? '')
    const statusIndex = Number(req.body.statusIndex)
    if (!itemId || !boardId || !columnId || !Number.isFinite(statusIndex)) {
      res.status(400).json({ error: 'itemId, boardId, columnId, and statusIndex required' })
      return
    }
    if (!isMondayConnected()) {
      res.status(401).json({ error: 'Monday not connected' })
      return
    }
    try {
      await moveMondayItemStatus(boardId, itemId, columnId, statusIndex)
      await syncMonday(io)
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.get('/cluster/monday/create-target', async (_req, res) => {
    if (!isMondayConnected()) {
      res.json({ connected: false, target: null })
      return
    }
    try {
      const target = await getMondayCreateTarget()
      res.json({ connected: true, target })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.post('/cluster/monday/create', async (req, res) => {
    const name = String(req.body.name ?? '').trim()
    const boardName = req.body.boardName ? String(req.body.boardName).trim() : undefined
    if (!name) {
      res.status(400).json({ error: 'name required' })
      return
    }
    if (!isMondayConnected()) {
      res.status(401).json({ error: 'Monday not connected' })
      return
    }
    try {
      const created = await createMondayItemOnBoard({ name, boardName })
      await syncMonday(io)
      res.json({
        ok: true,
        itemId: created.id,
        itemName: name,
        boardId: created.boardId,
        boardName: created.boardName,
        groupTitle: created.groupTitle,
        taskUrl: `https://monday.com/boards/${created.boardId}/pulses/${created.id}`
      })
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.post('/cluster/monday/run', async (req, res) => {
    const itemId = String(req.body.itemId ?? '')
    const command = String(req.body.command ?? '').trim()
    if (!itemId || !command) {
      res.status(400).json({ error: 'itemId and command required' })
      return
    }
    if (!isMondayConnected()) {
      res.status(401).json({ error: 'Monday not connected' })
      return
    }
    try {
      const result = await runMondayNaturalLanguage(itemId, command)
      await syncMonday(io)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.get('/cluster/action/help', (_req, res) => {
    res.json({ help: COMPOSE_HELP })
  })

  router.post('/cluster/action', async (req, res) => {
    const raw = String(req.body.text ?? '').trim()
    const contextItemId = req.body.contextItemId ? String(req.body.contextItemId) : undefined
    const parsed = parseComposeCommand(raw)
    if (!parsed) {
      res.status(400).json({ error: 'Use @provider syntax — try @monday: new task' })
      return
    }

    try {
      const result = await runIntegrationAction({
        provider: parsed.provider,
        command: parsed.body,
        raw,
        contextItemId,
        sessionId: '',
        io
      })

      if (!result.ok) {
        res.status(400).json({ ok: false, error: result.message, ...result })
        return
      }

      if (parsed.provider === 'monday') await syncMonday(io)
      else if (parsed.provider === 'gmail') await syncGmail(io)
      else if (parsed.provider === 'slack') await syncSlack(io)
      else if (parsed.provider === 'discord') await syncDiscord(io)
      else if (parsed.provider === 'x') await syncX(io)

      res.json(result)
    } catch (err) {
      res.status(500).json({ error: String(err) })
    }
  })

  router.get('/cluster/search', (req, res) => {
    const q = String(req.query.q ?? '')
    res.json(searchCluster(q))
  })

  router.post('/cluster/assist', (req, res) => {
    const query = String(req.body.query ?? '')
    const objective = req.body.objective as 'discovery' | 'v1_ship' | undefined
    res.json(mobileAssist(query, objective))
  })

  router.get('/mobile/context', (req, res) => {
    const objective = (req.query.objective as 'discovery' | 'v1_ship') ?? 'v1_ship'
    res.json(buildMobileContext(objective))
  })

  router.post('/sim/start-call', (_req, res) => {
    startSimCall()
    res.json({ ok: true, phase: 'live_call' })
  })

  router.post('/sim/end-call', (_req, res) => {
    stopSimCall()
    res.json({ ok: true, phase: 'post_call' })
  })

  return router
}

function successHtml(source: string): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#f0f0f0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>${source}</h2><p>You can close this window and return to STREAM.</p></div></body></html>`
}

function errorHtml(msg: string): string {
  return `<!DOCTYPE html><html><body style="background:#0a0a0a;color:#EA4335;font-family:system-ui;padding:2rem"><h2>Connection failed</h2><p>${msg}</p></body></html>`
}
