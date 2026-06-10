#!/usr/bin/env node
/**
 * Install macOS LaunchAgent so the permanent tunnel starts at login.
 * Usage: npm run install:stream-tunnel-agent
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CONFIG = join(ROOT, 'config', 'cloudflared.yml')
const LABEL = 'com.appliedscope.stream-api-tunnel'
const PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
const LOG_DIR = join(homedir(), 'Library', 'Logs', 'appliedscope')

if (!existsSync(CONFIG)) {
  console.error('Run npm run setup:stream-tunnel first')
  process.exit(1)
}

const node = process.execPath
const runner = join(ROOT, 'scripts', 'run-stream-tunnel.mjs')

mkdirSync(LOG_DIR, { recursive: true })

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${runner}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, 'stream-tunnel.log')}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, 'stream-tunnel.err.log')}</string>
</dict>
</plist>
`

writeFileSync(PLIST, plist)
spawnSync('launchctl', ['bootout', `gui/${process.getuid()}`, PLIST], { stdio: 'ignore' })
const load = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, PLIST], { encoding: 'utf-8' })
if (load.status !== 0) {
  console.error(load.stderr || load.stdout)
  process.exit(1)
}

console.log(`Installed LaunchAgent: ${PLIST}`)
console.log(`Logs: ${LOG_DIR}/stream-tunnel.log`)
console.log('\nTunnel will start at login and restart if it crashes.')
console.log('Unload: launchctl bootout gui/$(id -u) ' + PLIST)
