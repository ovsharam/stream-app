#!/usr/bin/env node
/**
 * Verify permanent STREAM API tunnel and local API.
 */
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function loadEnvLocal() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

function loadTunnelEnv() {
  const path = join(ROOT, 'config', 'stream-tunnel.env')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

async function probe(label, url, secret) {
  const headers = secret ? { Authorization: `Bearer ${secret}` } : {}
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
    const ok = res.status === 200 || (res.status === 401 && !secret)
    console.log(`${ok ? '✓' : '✗'} ${label}: HTTP ${res.status} — ${url}`)
    return ok
  } catch (err) {
    console.log(`✗ ${label}: unreachable — ${url}`)
    console.log(`  ${err instanceof Error ? err.message : err}`)
    return false
  }
}

async function main() {
  const env = loadEnvLocal()
  const tunnel = loadTunnelEnv()
  const secret = env.MEASURE_API_SECRET?.trim()
  const publicUrl = tunnel.STREAM_API_PUBLIC_URL || 'https://api.appliedscope.com'

  console.log('STREAM tunnel health\n')

  const local = await probe('Local API', 'http://localhost:3131/api/dashboard/data', secret)
  const remote = await probe('Public tunnel', `${publicUrl}/api/dashboard/data`, secret)

  if (!existsSync(join(ROOT, 'config', 'cloudflared.yml'))) {
    console.log('\n! Run: npm run setup:stream-tunnel')
  }
  if (!local) {
    console.log('\n! Start API: npm run dev:notch:live')
  }
  if (!remote) {
    console.log('\n! Start tunnel: npm run tunnel:api:prod')
  }

  process.exit(local && remote ? 0 : 1)
}

main()
