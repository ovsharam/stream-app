#!/usr/bin/env node
/**
 * One-time setup for permanent Cloudflare Tunnel → api.appliedscope.com
 * Usage: npm run setup:stream-tunnel
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONFIG_DIR = join(ROOT, 'config')
const TUNNEL_ENV = join(CONFIG_DIR, 'stream-tunnel.env')
const CLOUDFLARED_YML = join(CONFIG_DIR, 'cloudflared.yml')
const TEMPLATE = join(CONFIG_DIR, 'cloudflared.yml.template')
const TUNNEL_NAME = 'stream-api'
const PUBLIC_HOST = 'api.appliedscope.com'
const CLOUDFLARED_DIR = join(homedir(), '.cloudflared')

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf-8', ...opts })
  if (res.error) throw res.error
  return res
}

function requireCloudflared() {
  const res = run('cloudflared', ['--version'])
  if (res.status !== 0) {
    console.error('Install cloudflared: brew install cloudflared')
    process.exit(1)
  }
}

function hasOriginCert() {
  return existsSync(join(CLOUDFLARED_DIR, 'cert.pem'))
}

function ensureLogin() {
  if (hasOriginCert()) return
  console.log('\nCloudflare login required (browser will open)…\n')
  const res = run('cloudflared', ['tunnel', 'login'], { stdio: 'inherit' })
  if (res.status !== 0 || !hasOriginCert()) {
    console.error('Login failed. Run: cloudflared tunnel login')
    process.exit(1)
  }
}

function parseTunnelList(stdout) {
  const rows = []
  for (const line of stdout.split('\n')) {
    const m = line.match(/^([0-9a-f-]{36})\s+(\S+)/)
    if (m) rows.push({ id: m[1], name: m[2] })
  }
  return rows
}

function findTunnel() {
  const res = run('cloudflared', ['tunnel', 'list'])
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  return parseTunnelList(res.stdout).find((t) => t.name === TUNNEL_NAME)
}

function createTunnel() {
  console.log(`Creating tunnel "${TUNNEL_NAME}"…`)
  const res = run('cloudflared', ['tunnel', 'create', TUNNEL_NAME])
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  const combined = `${res.stdout}\n${res.stderr}`
  const idMatch = combined.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  const hit = findTunnel()
  if (hit) return hit
  if (idMatch) return { id: idMatch[1], name: TUNNEL_NAME }
  console.error('Could not parse tunnel id. Run: cloudflared tunnel list')
  process.exit(1)
}

function routeDns() {
  console.log(`Routing DNS ${PUBLIC_HOST} → ${TUNNEL_NAME}…`)
  const res = run('cloudflared', ['tunnel', 'route', 'dns', TUNNEL_NAME, PUBLIC_HOST])
  const out = `${res.stdout}\n${res.stderr}`
  if (res.status !== 0 && !/already exists|CNAME record already/i.test(out)) {
    console.warn('DNS route warning (domain must be on Cloudflare):')
    console.warn(out.trim())
  } else {
    console.log(out.trim() || `DNS route OK for ${PUBLIC_HOST}`)
  }
}

function writeConfig(tunnel) {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const credentialsFile = join(CLOUDFLARED_DIR, `${tunnel.id}.json`)
  if (!existsSync(credentialsFile)) {
    console.error(`Missing credentials: ${credentialsFile}`)
    process.exit(1)
  }

  const template = readFileSync(TEMPLATE, 'utf-8')
  const yml = template
    .replace(/\{\{TUNNEL_ID\}\}/g, tunnel.id)
    .replace(/\{\{CREDENTIALS_FILE\}\}/g, credentialsFile)
  writeFileSync(CLOUDFLARED_YML, yml)

  const envBody = [
    `TUNNEL_NAME=${TUNNEL_NAME}`,
    `TUNNEL_ID=${tunnel.id}`,
    `CREDENTIALS_FILE=${credentialsFile}`,
    `PUBLIC_HOST=${PUBLIC_HOST}`,
    `STREAM_API_PUBLIC_URL=https://${PUBLIC_HOST}`,
    ''
  ].join('\n')
  writeFileSync(TUNNEL_ENV, envBody)

  console.log(`\nWrote ${CLOUDFLARED_YML}`)
  console.log(`Wrote ${TUNNEL_ENV}`)
}

function main() {
  requireCloudflared()
  ensureLogin()

  let tunnel = findTunnel()
  if (!tunnel) tunnel = createTunnel()
  else console.log(`Using existing tunnel ${TUNNEL_NAME} (${tunnel.id})`)

  routeDns()
  writeConfig(tunnel)

  console.log(`
Permanent tunnel is configured.

Next steps:
  1. npm run tunnel:api:prod          # start tunnel (keep running)
  2. npm run dev:notch:live           # STREAM API on :3131
  3. npm run sync:measure-vercel      # point Vercel at https://${PUBLIC_HOST}

Or run both together:
  npm run dev:notch:live:stream

Verify:
  npm run verify:stream-tunnel
`)
}

main()
