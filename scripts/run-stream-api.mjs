#!/usr/bin/env node
/**
 * Headless STREAM API for LaunchAgent (no Electron / Vite).
 */
import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const ENTRY = join(ROOT, 'server', 'index.ts')

function loadEnvLocal() {
  const path = join(ROOT, '.env.local')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

if (!existsSync(TSX)) {
  console.error('[stream-api] Missing tsx — run npm install in repo root')
  process.exit(1)
}

const env = {
  ...process.env,
  ...loadEnvLocal(),
  SIMULATION_MODE: 'false',
  NOTCH_PROTOTYPE: '1',
  NODE_ENV: process.env.NODE_ENV || 'production'
}

console.log(`[stream-api] Starting STREAM API on :${env.PORT || '3131'}`)

const child = spawn(process.execPath, [TSX, ENTRY], {
  cwd: ROOT,
  env,
  stdio: 'inherit'
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})
