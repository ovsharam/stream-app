#!/usr/bin/env node
/**
 * Run the permanent named Cloudflare tunnel (api.appliedscope.com).
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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

console.log('[tunnel] api.appliedscope.com → http://localhost:3131')
console.log('[tunnel] Press Ctrl+C to stop\n')

const child = spawn('cloudflared', ['tunnel', '--config', CONFIG, 'run'], {
  stdio: 'inherit',
  env: process.env
})

child.on('exit', (code) => process.exit(code ?? 0))
