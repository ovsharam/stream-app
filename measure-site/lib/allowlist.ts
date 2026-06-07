/** Whether Google login is required (production auth env present). */
export function isMeasureAuthEnabled(): boolean {
  return Boolean(
    process.env.AUTH_SECRET?.trim() &&
      process.env.AUTH_GOOGLE_ID?.trim() &&
      process.env.AUTH_GOOGLE_SECRET?.trim()
  )
}

export function isEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false

  const domain = process.env.MEASURE_ALLOWED_DOMAIN?.trim().toLowerCase()
  if (domain) {
    const suffix = domain.startsWith('@') ? domain : `@${domain}`
    if (normalized.endsWith(suffix)) return true
  }

  const list = process.env.MEASURE_ALLOWED_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) ?? []
  if (list.length > 0) return list.includes(normalized)

  // Auth enabled but no allowlist — deny by default.
  return isMeasureAuthEnabled() ? false : true
}
