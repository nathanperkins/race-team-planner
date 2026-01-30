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
        const discordId = profile?.id as string

        if (discordId) {
          const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
          const result = await checkGuildMembership(discordId)

          if (result !== GuildMembershipStatus.MEMBER) {
            return `/not-found?error=${result}`
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
