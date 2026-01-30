import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import Discord from 'next-auth/providers/discord'
import Credentials from 'next-auth/providers/credentials'
import { features } from '@/lib/config'

const mockAuthProvider = Credentials({
  name: 'Mock User',
  credentials: {
    id: { label: 'User ID', type: 'text' },
  },
  authorize: async (credentials) => {
    if (!credentials?.id) {
      return null
    }

    const id = credentials.id as string

    const user = await prisma.user.findUnique({
      where: { id },
    })

    return user
  },
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  providers: [
    ...(features.discordAuth ? [Discord] : []),
    ...(features.mockAuth ? [mockAuthProvider] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // 1. Allow Mock Auth to bypass checks
      if (account?.provider === 'credentials') {
        return true
      }

      // 2. Perform Guild Membership Check for Discord
      if (account?.provider === 'discord') {
        // Dynamic import to avoid circular dep issues if any, keeping it clean
        const { checkGuildMembership } = await import('@/lib/discord')

        // Use profile.id (Discord ID) not user.id (Database UUID)
        const discordId = profile?.id as string

        if (discordId) {
          const isMember = await checkGuildMembership(discordId)
          if (!isMember) {
            // Redirect to a custom error page or return false to show default error
            // Returning false displays default "AccessDenied" error on /api/auth/error
            // We can customize this by returning a string URL later
            return '/not-found?error=access_denied_guild_membership'
          }
        }
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        const user = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { iracingCustomerId: true },
        })
        if (user) {
          session.user.iracingCustomerId = user.iracingCustomerId
        }
      }
      return session
    },
  },
})
