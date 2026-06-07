import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { isEmailAllowed, isMeasureAuthEnabled } from '@/lib/allowlist'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET
    })
  ],
  pages: {
    signIn: '/login'
  },
  trustHost: true,
  callbacks: {
    signIn({ user }) {
      if (!isMeasureAuthEnabled()) return true
      const email = user.email?.trim()
      if (!email) return false
      return isEmailAllowed(email)
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email
      }
      return session
    },
    jwt({ token, user }) {
      if (user?.email) token.email = user.email
      return token
    }
  }
})
