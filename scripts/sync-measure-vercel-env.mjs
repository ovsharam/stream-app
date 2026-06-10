#!/usr/bin/env node
/**
 * Point appliedscope.com (Vercel) at the permanent STREAM API URL.
 */
import { spawnSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MEASURE_DIR = join(ROOT, 'measure-site')
const TUNNEL_ENV = join(ROOT, 'config', 'stream-tunnel.env')
const DEFAULT_URL = 'https://api.appliedscope.com'

function publicUrl() {
  if (!existsSync(TUNNEL_ENV)) return DEFAULT_URL
  for (const line of readFileSync(TUNNEL_ENV, 'utf-8').split('\n')) {
    const m = line.match(/^STREAM_API_PUBLIC_URL=(.+)$/)
    if (m?.[1]) return m[1].trim()
  }
  return DEFAULT_URL
}

function setEnv(name, value) {
  const res = spawnSync('vercel', ['env', 'add', name, 'production', '--force'], {
    cwd: MEASURE_DIR,
    input: value,
    encoding: 'utf-8'
  })
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout)
    process.exit(1)
  }
  console.log(`Set ${name}=${value}`)
}

const url = publicUrl()
console.log(`Syncing Vercel (appliedscope) → ${url}\n`)

setEnv('STREAM_API_URL', url)
setEnv('STREAM_SOCKET_URL', url)

console.log('\nRedeploying measure-site…')
const deploy = spawnSync('vercel', ['--prod', '--yes'], {
  cwd: MEASURE_DIR,
  stdio: 'inherit'
})
process.exit(deploy.status ?? 1)
