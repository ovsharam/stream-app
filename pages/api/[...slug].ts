import type { NextApiRequest, NextApiResponse } from 'next'
import { join } from 'path'
import { homedir } from 'os'
import { createApp } from '../../server/createApp'
import { initDb } from '../../server/db'
import { initStore } from '../../server/store'
import { seedDemoData } from '../../server/demoSeed'

let ready = false
const app = createApp()

async function ensureReady(): Promise<void> {
  if (ready) return
  const dataDir = process.env.STREAM_DATA_DIR ?? join(homedir(), '.stream-app')
  initStore(dataDir)
  await initDb(dataDir)
  if (process.env.DEMO_MODE === '1') seedDemoData()
  ready = true
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await ensureReady()
  return app(req, res)
}

export const config = {
  api: {
    bodyParser: true,
    externalResolver: true
  }
}
