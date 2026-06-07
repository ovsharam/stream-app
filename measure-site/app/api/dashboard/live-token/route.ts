import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isMeasureAuthEnabled } from '@/lib/allowlist'
import { signMeasureToken } from '@/lib/measure-token'
import { measureApiSecret, streamSocketUrl } from '@/lib/stream-api-config'

export async function GET() {
  const socketUrl = streamSocketUrl()
  if (!socketUrl) {
    return NextResponse.json({ error: 'Socket URL not configured' }, { status: 503 })
  }

  const secret = measureApiSecret()
  if (!secret) {
    return NextResponse.json({ socketUrl })
  }

  if (isMeasureAuthEnabled()) {
    const session = await auth()
    const email = session?.user?.email?.trim()
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = signMeasureToken(email, secret)
    return NextResponse.json({ socketUrl, token })
  }

  return NextResponse.json({ socketUrl })
}
