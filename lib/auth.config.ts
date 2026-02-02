import type { NextAuthConfig } from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { features } from '@/lib/config'
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.iracingCustomerId = user.iracingCustomerId
        token.expectationsVersion = user.expectationsVersion
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as UserRole) || UserRole.USER
        session.user.iracingCustomerId = token.iracingCustomerId as string
        session.user.expectationsVersion = (token.expectationsVersion as number) || 0
      }
      return session
    },
  },
} satisfies NextAuthConfig
