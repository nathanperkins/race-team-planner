import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import { authConfig } from './auth.config'
import Credentials from 'next-auth/providers/credentials'
import { features, SESSION_VERSION } from '@/lib/config'
import {
  verifyGuildMembership,
  shouldRefreshUser,
  refreshUserData,
  syncDiscordProfile,
} from './services/auth-service'

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
      if (account?.provider === 'discord' && profile?.id) {
        return await verifyGuildMembership(profile.id as string)
      }

      return true
    },
    async jwt({ token, user, trigger, session }) {
      // 1. Run base mapping from authConfig
      if (authConfig.callbacks?.jwt) {
        token = await authConfig.callbacks.jwt({
          token,
          user,
          trigger,
          session,
          account: null,
          profile: undefined,
        })
      }

      // 2. Auto-heal: Refresh from DB if info is missing OR if we're explicitly updating.
      if (token.id && shouldRefreshUser(token, trigger)) {
        console.log(`[auth][jwt] Refreshing data for user ${token.id} (trigger: ${trigger})`)
        const dbUser = await refreshUserData(token.id as string)
        if (dbUser) {
          console.log(
            `[auth][jwt] Found DB user. ID: ${dbUser.iracingCustomerId}, Role: ${dbUser.role}`
          )
          token.role = dbUser.role
          token.iracingCustomerId = dbUser.iracingCustomerId
          token.expectationsVersion = dbUser.expectationsVersion
          token.version = SESSION_VERSION
          token.lastChecked = Date.now()
        } else {
          console.warn(`[auth][jwt] Failed to find user in DB during refresh: ${token.id}`)
        }
      }

      return token
    },
    // The session() callback from authConfig is inherited automatically
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile && user.id) {
        console.log(`[auth][event][signIn] Syncing profile for ${user.email}`)
        try {
          await syncDiscordProfile(user.id, profile)
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
