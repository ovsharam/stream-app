import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isMeasureAuthEnabled } from '@/lib/allowlist'

export default auth((req) => {
  if (!isMeasureAuthEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl
  const isAuthRoute = pathname.startsWith('/api/auth')
  const isLogin = pathname === '/login'

  if (isAuthRoute) return NextResponse.next()

  if (isLogin) {
    if (req.auth) return NextResponse.redirect(new URL('/', req.url))
    return NextResponse.next()
  }

  if (!req.auth) {
    const login = new URL('/login', req.url)
    login.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
