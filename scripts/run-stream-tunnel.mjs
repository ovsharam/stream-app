#!/usr/bin/env node
/**
 * Run the permanent named Cloudflare tunnel (api.appliedscope.com).
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { waitForLocalApi } from './wait-for-local-api.mjs'

function resolveCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared'
  ].filter(Boolean)
  for (const bin of candidates) {
    if (existsSync(bin)) return bin
  }
  return 'cloudflared'
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONFIG = join(ROOT, 'config', 'cloudflared.yml')
const ENV_FILE = join(ROOT, 'config', 'stream-tunnel.env')

if (!existsSync(CONFIG)) {
  console.error(`Missing ${CONFIG}`)
  console.error('Run once: npm run setup:stream-tunnel')
  process.exit(1)
}

if (existsSync(ENV_FILE)) {
  console.log(`[tunnel] ${ENV_FILE.replace(ROOT, '.')}`)
}

console.log('[tunnel] Waiting for local STREAM API on :3131…')
const ready = await waitForLocalApi()
if (!ready) {
  console.error('[tunnel] STREAM API never became ready — start API first (npm run stream:api or LaunchAgent)')
  process.exit(1)
}

console.log('[tunnel] api.appliedscope.com → http://localhost:3131')
console.log('[tunnel] Press Ctrl+C to stop\n')

const cloudflared = resolveCloudflared()
console.log(`[tunnel] cloudflared: ${cloudflared}`)

const child = spawn(cloudflared, ['tunnel', '--config', CONFIG, 'run'], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code) => process.exit(code ?? 0))
