import type { NextAuthConfig } from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { features, SESSION_VERSION } from '@/lib/config'
import { UserRole } from '@prisma/client'

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
    async jwt({ token, user, trigger, session }) {
      // 1. Initial login: copy persistent fields to token
      if (user) {
        token.id = user.id
        token.role = user.role
        token.iracingCustomerId = user.iracingCustomerId
        token.expectationsVersion = user.expectationsVersion
        token.version = SESSION_VERSION
      }

      // 2. Handle updates from useSession().update(data)
      // This allows the Edge runtime (Middleware) to see new data immediately
      if (trigger === 'update' && session) {
        if (session.iracingCustomerId !== undefined) {
          token.iracingCustomerId = session.iracingCustomerId
        }
        if (session.expectationsVersion !== undefined) {
          token.expectationsVersion = session.expectationsVersion
        }
      }

      return token
    },
    async session({ session, token }) {
      // Transfer fields from token to session object
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string)
        session.user.role = (token.role as UserRole) || UserRole.USER
        session.user.iracingCustomerId = token.iracingCustomerId as number
        session.user.expectationsVersion = (token.expectationsVersion as number) || 0
        session.version = (token.version as number) || 0
      }
      return session
    },
  },
} satisfies NextAuthConfig
