import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import { authConfig } from './auth.config'
import Credentials from 'next-auth/providers/credentials'
import { features, CURRENT_EXPECTATIONS_VERSION } from '@/lib/config'
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
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  providers: [...authConfig.providers, ...(features.mockAuth ? [mockAuthProvider] : [])],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      // 1. Allow Mock Auth to bypass checks
      if (account?.provider === 'credentials') {
        return true
      }

      // 2. Perform Guild Membership Check for Discord
      if (account?.provider === 'discord' && profile) {
        const discordId = profile.id as string

        if (discordId) {
          const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
          const { status } = await checkGuildMembership(discordId)

          if (status !== GuildMembershipStatus.MEMBER) {
            console.log(`[auth][signIn] Denying access: ${status}`)
            return `/not-found?error=${status}`
          }
        }
      }

      return true
    },
    async jwt({ token, user, trigger }) {
      if (token.iracingCustomerId && typeof token.iracingCustomerId === 'string') {
        const parsed = Number(token.iracingCustomerId)
        token.iracingCustomerId = Number.isFinite(parsed) ? parsed : null
      }

      if (user) {
        token.id = user.id
        token.iracingCustomerId = user.iracingCustomerId
        token.role = user.role
        token.expectationsVersion = user.expectationsVersion
      }

      // Auto-heal: Refresh from DB if info is missing OR if we're explicitly updating/signing in.
      const isMissingInfo =
        !token.iracingCustomerId ||
        ((token.expectationsVersion as number) || 0) < CURRENT_EXPECTATIONS_VERSION
      const now = Date.now()
      const lastChecked = (token.lastChecked as number) || 0
      const cooldown = 5000 // 5 seconds

      const shouldRefresh =
        !!trigger || // Refresh on any trigger (signIn, signUp, update)
        (isMissingInfo && now - lastChecked > cooldown)

      if (token.id && shouldRefresh) {
        // console.log(`[auth][jwt] Refreshing user data (trigger: ${trigger || 'auto-heal'})`)
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, iracingCustomerId: true, expectationsVersion: true },
        })
        if (dbUser) {
          token.role = dbUser.role
          token.iracingCustomerId = dbUser.iracingCustomerId
          token.expectationsVersion = dbUser.expectationsVersion
          token.lastChecked = now
        }
      }

      return token
    },
    async session({ session, token }) {
      if (typeof token.iracingCustomerId === 'string') {
        const parsed = Number(token.iracingCustomerId)
        token.iracingCustomerId = Number.isFinite(parsed) ? parsed : null
      }

      if (session.user && token.id) {
        session.user.id = token.id as string
        session.user.role = (token.role as UserRole) || UserRole.USER
        session.user.iracingCustomerId = token.iracingCustomerId as number
        session.user.expectationsVersion = (token.expectationsVersion as number) || 0
      }
      return session
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile && user.id) {
        console.log(`[auth][event][signIn] Syncing profile for ${user.email}`)

        try {
          // Check guild roles to determine admin status
          const { checkGuildMembership } = await import('@/lib/discord')
          const { roles, nick } = await checkGuildMembership(profile.id as string)

          const adminRoleIdsStr = process.env.DISCORD_ADMIN_ROLE_IDS || ''
          const adminRoleIds = adminRoleIdsStr.split(',').map((id) => id.trim())
          const isAdmin = roles?.some((roleId) => adminRoleIds.includes(roleId))
          const targetRole = isAdmin ? UserRole.ADMIN : UserRole.USER

          // Update the user record with latest info from Discord
          await prisma.user.update({
            where: { id: user.id },
            data: {
              role: targetRole,
              name: nick || profile.name || profile.username || user.name,
              image: profile.image_url || profile.avatar || user.image,
            },
          })
          console.log(`[auth][event][signIn] Profile sync complete. Role: ${targetRole}`)
        } catch (error) {
          console.error('[auth][event][signIn] Failed to sync profile:', error)
        }
      }
    },
    async linkAccount({ user }) {
      console.log(`[auth][event][linkAccount] Account linked for user ${user.id}`)
    },
  },
})
