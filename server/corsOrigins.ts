const LOCAL_DEV_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3131'
]

const PRODUCTION_ORIGINS = [
  'https://useplumb.ai',
  'https://www.useplumb.ai',
  'https://app.useplumb.ai'
]

function collectConfiguredOrigins(): Set<string> {
  const origins = new Set<string>()
  const appUrl = process.env.APP_URL?.trim()
  if (appUrl) origins.add(appUrl)

  const measureSite = process.env.MEASURE_SITE_URL?.trim()
  if (measureSite) origins.add(measureSite)

  for (const raw of process.env.CORS_ORIGINS?.split(',') ?? []) {
    const origin = raw.trim()
    if (origin) origins.add(origin)
  }

  return origins
}

/** True when the API is the local Notch dev stack (Electron + Vite), not a remote deploy. */
function isLocalNotchDev(): boolean {
  return (
    process.env.NOTCH_PROTOTYPE === '1' ||
    process.env.STREAM_LOCAL_DEV === '1' ||
    (process.env.PORT ?? '3131') === '3131'
  )
}

/** Origins allowed for browser/Electron fetch from the API (credentials: include). */
export function getCorsOrigins(): string[] | true {
  const configured = collectConfiguredOrigins()

  if (process.env.NODE_ENV === 'production' && !isLocalNotchDev()) {
    // Always include the useplumb.ai domains in production
    const origins = new Set(PRODUCTION_ORIGINS)
    for (const origin of configured) origins.add(origin)
    return [...origins]
  }

  const origins = new Set(LOCAL_DEV_ORIGINS)
  // Include production origins in dev too (so the web app can hit local API for testing)
  for (const origin of PRODUCTION_ORIGINS) origins.add(origin)
  for (const origin of configured) origins.add(origin)
  return [...origins]
}
