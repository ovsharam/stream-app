import { createHmac } from 'crypto'

type MeasureTokenPayload = { email: string; exp: number }

export function signMeasureToken(email: string, secret: string, ttlMs = 60 * 60 * 1000): string {
  const payload: MeasureTokenPayload = { email, exp: Date.now() + ttlMs }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}
