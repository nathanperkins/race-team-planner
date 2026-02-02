import type { NextAuthConfig } from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { features } from '@/lib/config'

export const authConfig = {
  providers: [
    ...(features.discordAuth
      ? [
          Discord({
            clientId: process.env.AUTH_DISCORD_ID,
            clientSecret: process.env.AUTH_DISCORD_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isApiRoute = nextUrl.pathname.startsWith('/api')
      const isPublicRoute =
        nextUrl.pathname === '/' ||
        nextUrl.pathname === '/login' ||
        nextUrl.pathname === '/not-found' ||
        nextUrl.pathname.startsWith('/_next') ||
        nextUrl.pathname.includes('.') // for favicon, etc.

      if (isPublicRoute || isApiRoute) {
        return true
      }

      if (!isLoggedIn) {
        return false // Redirect to login
      }

      return true
    },
    async session({ session, token }) {
      if (session.user && token.iracingCustomerId) {
        session.user.iracingCustomerId = token.iracingCustomerId as string
      }
      return session
    },
  },
} satisfies NextAuthConfig
