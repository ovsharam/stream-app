import type { FalkorDBOptions } from 'falkordb/dist/src/falkordb'
import type Graph from 'falkordb/dist/src/graph'
import type FalkorDB from 'falkordb/dist/src/falkordb'

let client: FalkorDB | null = null
let connectPromise: Promise<FalkorDB> | null = null

export function falkorConfigured(): boolean {
  if (process.env.FALKORDB_DISABLED === '1') return false
  return Boolean(
    process.env.FALKORDB_URL?.trim() ||
      process.env.FALKORDB_HOST?.trim() ||
      process.env.FALKORDB_ENABLED === '1'
  )
}

function connectionOptions(): FalkorDBOptions {
  const url = process.env.FALKORDB_URL?.trim()
  if (url) return { url }

  const host = process.env.FALKORDB_HOST?.trim() || 'localhost'
  const port = Number(process.env.FALKORDB_PORT ?? 6379)
  const username = process.env.FALKORDB_USERNAME?.trim()
  const password = process.env.FALKORDB_PASSWORD?.trim()

  if (username || password) {
    return {
      socket: { host, port },
      username: username || 'falkordb',
      password
    }
  }

  return { socket: { host, port } }
}

export async function getFalkorClient(): Promise<FalkorDB> {
  if (client) return client
  if (!connectPromise) {
    connectPromise = (async () => {
      const { FalkorDB: FalkorDBClass } = await import('falkordb')
      const db = await FalkorDBClass.connect(connectionOptions())
      client = db
      return db
    })().catch((err) => {
      connectPromise = null
      throw err
    })
  }
  return connectPromise
}

export async function getFalkorGraph(): Promise<Graph> {
  const db = await getFalkorClient()
  const graphName = process.env.FALKORDB_GRAPH?.trim() || 'notch'
  return db.selectGraph(graphName)
}

export async function pingFalkor(): Promise<boolean> {
  if (!falkorConfigured()) return false
  const db = await getFalkorClient()
  await db.list()
  return true
}

export async function closeFalkor(): Promise<void> {
  if (!client) return
  await client.close()
  client = null
  connectPromise = null
}
