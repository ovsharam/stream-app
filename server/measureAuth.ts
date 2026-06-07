import { createHmac, timingSafeEqual } from 'crypto'
import type { Request } from 'express'

type MeasureTokenPayload = { email: string; exp: number }

export function measureProtectionEnabled(): boolean {
  return Boolean(process.env.MEASURE_API_SECRET?.trim())
}

function measureSecret(): string | null {
  const secret = process.env.MEASURE_API_SECRET?.trim()
  return secret || null
}

export function verifyMeasureToken(token: string, secret?: string): MeasureTokenPayload | null {
  const key = secret ?? measureSecret()
  if (!key) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  if (!body || !sig) return null

  const expected = createHmac('sha256', key).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MeasureTokenPayload
    if (!payload.email || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function verifyMeasureRequest(req: Pick<Request, 'headers'>): boolean {
  if (!measureProtectionEnabled()) return true

  const secret = measureSecret()!
  const auth = req.headers.authorization
  if (auth === `Bearer ${secret}`) return true

  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (token && verifyMeasureToken(token, secret)) return true

  return false
}

export function requireMeasureAuth(
  req: Pick<Request, 'headers'>,
  res: { status: (code: number) => { json: (body: unknown) => void } },
  next: () => void
): void {
  if (verifyMeasureRequest(req)) {
    next()
    return
  }
  res.status(401).json({ error: 'Unauthorized' })
}
