#!/usr/bin/env node
/**
 * Permanent Measure connectivity: STREAM API + Cloudflare tunnel as macOS LaunchAgents.
 */
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

function run(script) {
  const path = join(ROOT, 'scripts', script)
  const r = spawnSync(process.execPath, [path], { stdio: 'inherit', cwd: ROOT })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log('Applied Scope — install STREAM stack (API + tunnel)\n')

if (!existsSync(join(ROOT, 'config', 'cloudflared.yml'))) {
  console.error('Missing config/cloudflared.yml — run first: npm run setup:stream-tunnel')
  process.exit(1)
}

run('install-stream-api-agent.mjs')
run('install-stream-tunnel-agent.mjs')

console.log('\n✓ Stack installed. API and tunnel start at login and restart on crash.')
console.log('  Verify: npm run verify:stream-tunnel')
console.log('  Logs:   ~/Library/Logs/appliedscope/')
console.log('\nOptional — cloud cache when Mac sleeps: set SUPABASE_* in .env.local and Vercel, run supabase migration 005.')
