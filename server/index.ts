import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { join } from 'path'
import { homedir } from 'os'
import { config } from 'dotenv'
import { initDb, getRecentItems } from './db'
import { initStore } from './store'
import { createApp } from './createApp'
import { streamItemToApi } from '../shared/serialize'
import { seedDemoData } from './demoSeed'
import { syncGmail } from './sources/gmail'
import { syncSlack, startSlackSocketMode } from './sources/slack'
import { syncX, startXPolling } from './sources/x'

config()

async function main(): Promise<void> {
  const PORT = parseInt(process.env.PORT ?? '3131', 10)
  const dataDir =
    process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')

  initStore(dataDir)
  await initDb(dataDir)

  if (process.env.DEMO_MODE === '1') {
    seedDemoData()
    console.log('[server] demo seed loaded')
  }

  let io: SocketServer
  const app = createApp(() => io)
  const httpServer = createServer(app)
  io = new SocketServer(httpServer, {
    cors: { origin: process.env.APP_URL ?? '*', methods: ['GET', 'POST', 'PATCH'] }
  })

  io.on('connection', (socket) => {
    console.log('[socket] client connected', socket.id)
    const cached = getRecentItems(100)
    socket.emit('stream:bootstrap', cached.map(streamItemToApi))
  })

  async function backgroundSync(): Promise<void> {
    await Promise.allSettled([syncGmail(io), syncSlack(io), syncX(io)])
  }

  httpServer.listen(PORT, () => {
    console.log(`[server] STREAM API ready on :${PORT}`)
    void backgroundSync()
    void startSlackSocketMode(io).catch((e) =>
      console.warn('[slack] socket mode skipped:', e.message)
    )
    if (process.env.DEMO_MODE !== '1') startXPolling(io)
  })
}

void main()
