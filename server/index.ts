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

config({ path: join(process.cwd(), '.env.local') })
config()

async function main(): Promise<void> {
  const PORT = parseInt(process.env.PORT ?? '3131', 10)
  const dataDir =
    process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')

  initStore(dataDir)
  await initDb(dataDir)

  if (process.env.GEMINI_API_KEY?.trim()) {
    console.log('[server] GEMINI_API_KEY loaded — auto-connects per session')
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
      syncCalcom(io)
    ])
    try {
      ingestRecentStream(200)
    } catch (e) {
      console.warn('[kb] ingest skipped:', e instanceof Error ? e.message : e)
    }
  }

  httpServer.listen(PORT, () => {
    console.log(`[server] STREAM API ready on :${PORT}`)
    void backgroundSync()
    setInterval(() => void backgroundSync(), 30 * 60_000)
    void startSlackSocketMode(io).catch((e) =>
      console.warn('[slack] socket mode skipped:', e.message)
    )
    if (process.env.DEMO_MODE !== '1') startXPolling(io)
  })
}

void main()
