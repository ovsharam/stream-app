import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { join } from 'path'
import { homedir } from 'os'
import { config } from 'dotenv'
import { initDb, getRecentItems, deleteDemoSeedItems } from './db'
import { initStore } from './store'
import { createApp } from './createApp'
import { streamItemToApi } from '../shared/serialize'
import { seedDemoData } from './demoSeed'
import { syncSlack, startSlackSocketMode } from './sources/slack'
import { syncX, startXPolling } from './sources/x'
import { syncMonday } from './sources/monday'
import { syncDiscord } from './sources/discord'
import { syncGithub } from './sources/github'
import { syncGong } from './sources/gong'
import { syncCalcom } from './sources/calcom'
import { syncClaude } from './sources/claude'
import { syncPerplexity } from './sources/perplexity'
import { bootstrapSimGraph } from './sim/engine'
import { getCorsOrigins } from './corsOrigins'
import { ingestRecentStream } from './kb/pipeline'
import { initOperatorTelemetryStore } from './telemetry/store'
import { initAgentStore } from './agent/store'
import { bindDashboardSocket } from './dashboard/broadcast'
import { initIntentionEpisodes } from './intention/service'
import { syncGoogleSourcesIfDue } from './googleBackgroundSync'

config({ path: join(process.cwd(), '.env.local') })
config()

for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return
    throw err
  })
}

async function main(): Promise<void> {
  const PORT = parseInt(process.env.PORT ?? '3131', 10)
  const dataDir =
    process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')

  initStore(dataDir)
  await initDb(dataDir)
  initOperatorTelemetryStore()
  initAgentStore()
  initIntentionEpisodes()

  if (process.env.GEMINI_API_KEY?.trim()) {
    console.log('[server] GEMINI_API_KEY loaded — auto-connects per session')
  }
  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    console.log('[server] ANTHROPIC_API_KEY loaded — auto-connects per session')
  }

  if (process.env.DEMO_MODE !== '1') {
    const removed = deleteDemoSeedItems()
    if (removed > 0) console.log(`[server] purged ${removed} demo seed items`)
  }

  if (process.env.DEMO_MODE === '1') {
    seedDemoData()
    await bootstrapSimGraph()
    console.log('[server] demo seed loaded')
  }

  let io: SocketServer
  const app = createApp(() => io)
  const httpServer = createServer(app)
  io = new SocketServer(httpServer, {
    cors: {
      origin: getCorsOrigins(),
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true
    }
  })

  bindDashboardSocket(io)

  io.use((socket, next) => {
    const { measureProtectionEnabled, verifyMeasureToken } =
      require('./measureAuth') as typeof import('./measureAuth')
    if (!measureProtectionEnabled()) {
      next()
      return
    }
    const secret = process.env.MEASURE_API_SECRET!.trim()
    const token = socket.handshake.auth?.token
    if (typeof token === 'string' && verifyMeasureToken(token, secret)) {
      next()
      return
    }
    next(new Error('Unauthorized'))
  })

  io.on('connection', (socket) => {
    console.log('[socket] client connected', socket.id)
    const cached = getRecentItems(100)
    socket.emit('stream:bootstrap', cached.map(streamItemToApi))
  })

  async function backgroundSync(): Promise<void> {
    await Promise.allSettled([
      syncSlack(io),
      syncX(io),
      syncMonday(io),
      syncDiscord(io),
      syncGithub(io),
      syncGong(io),
      syncClaude(io),
      syncPerplexity(io),
      syncCalcom(io),
      syncGoogleSourcesIfDue(io)
    ])
    try {
      ingestRecentStream(200)
    } catch (e) {
      console.warn('[kb] ingest skipped:', e instanceof Error ? e.message : e)
    }
  }

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[server] Port :${PORT} already in use — run: npm run stop:notch  (or quit the other Notch dev stack)`
      )
      process.exit(1)
    }
    throw err
  })

  httpServer.listen(PORT, () => {
    console.log(`[server] STREAM API ready on :${PORT}`)
    void backgroundSync()
    setInterval(() => void backgroundSync(), 5 * 60_000)
    void startSlackSocketMode(io).catch((e) =>
      console.warn('[slack] socket mode skipped:', e.message)
    )
    if (process.env.DEMO_MODE !== '1') startXPolling(io)
  })
}

void main()
