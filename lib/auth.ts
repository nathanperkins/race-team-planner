import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import Discord from 'next-auth/providers/discord'
import Credentials from 'next-auth/providers/credentials'
import { features } from '@/lib/config'
import { UserRole } from '@prisma/client'

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
    async signIn({ account, profile, user }) {
      // 1. Allow Mock Auth to bypass checks
      if (account?.provider === 'credentials') {
        return true
      }

      // 2. Perform Guild Membership Check for Discord
      if (account?.provider === 'discord') {
        const discordId = profile?.id as string

        if (discordId) {
          const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
          const { status, roles } = await checkGuildMembership(discordId)

          if (status !== GuildMembershipStatus.MEMBER) {
            return `/not-found?error=${status}`
          }

          // Check if admin
          const adminRoleIdsStr = process.env.DISCORD_ADMIN_ROLE_IDS || ''
          const adminRoleIds = adminRoleIdsStr.split(',').map((id) => id.trim())
          const isAdmin = roles?.some((roleId) => adminRoleIds.includes(roleId))

          // We'll update the role in the database if it doesn't match
          const targetRole = isAdmin ? UserRole.ADMIN : UserRole.USER

          if (user.id) {
            // Note: user.id here is the one from the database (since we have an adapter)
            // If it's a new user, user.id might not be in the database yet until the sign-in finishes.
            // But with Prisma adapter, it's usually already created or looked up.
            await prisma.user.update({
              where: { id: user.id },
              data: { role: targetRole },
            })
          }
        }
      }

      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      } else if (token.id && !token.role) {
        // Fallback or lookup
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        })
        if (dbUser) {
          token.role = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
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
