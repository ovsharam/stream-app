const LOCAL_DEV_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3131'
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

/** Origins allowed for browser/Electron fetch from the API (credentials: include). */
export function getCorsOrigins(): string[] | true {
  const configured = collectConfiguredOrigins()
  if (process.env.NODE_ENV === 'production') {
    return configured.size > 0 ? [...configured] : true
  }
  const origins = new Set(LOCAL_DEV_ORIGINS)
  for (const origin of configured) origins.add(origin)
  return [...origins]
}
