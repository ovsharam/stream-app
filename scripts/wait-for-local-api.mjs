#!/usr/bin/env node
/**
 * Block until STREAM API responds on localhost:3131 (or timeout).
 */
const PORT = process.env.STREAM_API_PORT || '3131'
const TIMEOUT_MS = Number(process.env.STREAM_API_WAIT_MS || 120_000)
const INTERVAL_MS = 1500

export async function waitForLocalApi(opts = {}) {
  const port = opts.port ?? PORT
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const url = `http://127.0.0.1:${port}/api/dashboard/data`
  const started = Date.now()

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status === 200 || res.status === 401) return true
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
  return false
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await waitForLocalApi()
  if (!ok) {
    console.error(`[wait-for-api] STREAM API not ready on :${PORT} after ${TIMEOUT_MS}ms`)
    process.exit(1)
  }
  console.log(`[wait-for-api] STREAM API ready on :${PORT}`)
}
