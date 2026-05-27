const LOCAL_DEV_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:3000',
  'http://localhost:3131'
]

/** Origins allowed for browser/Electron fetch from the API (credentials: include). */
export function getCorsOrigins(): string[] | true {
  const appUrl = process.env.APP_URL
  if (process.env.NODE_ENV === 'production') {
    return appUrl ? [appUrl] : true
  }
  const origins = new Set(LOCAL_DEV_ORIGINS)
  if (appUrl) origins.add(appUrl)
  return [...origins]
}
