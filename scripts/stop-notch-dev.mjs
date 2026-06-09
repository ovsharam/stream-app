#!/usr/bin/env node
/**
 * Free Notch dev ports and quit stray Electron/API/Vite processes before restart.
 */
import { execSync } from 'child_process'

function killPort(port) {
  try {
    const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim()
    if (!out) return
    for (const pid of out.split(/\s+/)) {
      if (!pid) continue
      try {
        process.kill(Number(pid), 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* port free */
  }
}

function shell(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' })
  } catch {
    /* no matching processes */
  }
}

shell('pkill -f "notch/dist-electron/electron/main.js"')
shell('pkill -f "stream-app/node_modules/electron/dist/Electron"')
shell('pkill -f "concurrently -n api,ui,electron"')
for (const port of [3131, 5174]) killPort(port)
try {
  execSync('sleep 0.4')
} catch {
  /* windows */
}
for (const port of [3131, 5174]) killPort(port)
