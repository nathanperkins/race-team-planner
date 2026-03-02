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
import type { GuildMembershipResult } from '@/lib/discord'
import { createLogger } from './logger'

const logger = createLogger('auth')

// Bridges membership data from the signIn callback (which fetches it to verify
// guild access) to the signIn event (which needs it to update the user profile).
// Avoids a second Discord API call and ensures that if an account is created,
// the profile sync always has a confirmed MEMBER result to work with.
const PENDING_MEMBERSHIP_TTL = 60_000
const pendingMemberships = new Map<string, { data: GuildMembershipResult; ts: number }>()

function setPendingMembership(discordId: string, data: GuildMembershipResult): void {
  pendingMemberships.set(discordId, { data, ts: Date.now() })
}

function takePendingMembership(discordId: string): GuildMembershipResult | undefined {
  const entry = pendingMemberships.get(discordId)
  pendingMemberships.delete(discordId)
  if (entry && Date.now() - entry.ts < PENDING_MEMBERSHIP_TTL) return entry.data
  return undefined
}

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
      if (account?.provider === 'discord') {
        if (!profile?.id) {
          logger.error('Discord sign-in attempted without a profile ID')
          return false
        }
        const check = await verifyGuildMembership(profile.id as string)
        if (!check.granted) return check.redirectUrl
        setPendingMembership(profile.id as string, check.data)
        return true
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
        logger.debug(`Refreshing data for user ${token.id} (trigger: ${trigger})`)
        const dbUser = await refreshUserData(token.id as string)
        if (dbUser) {
          logger.debug(`Found DB user. ID: ${dbUser.iracingCustomerId}, Role: ${dbUser.role}`)
          token.role = dbUser.role
          token.iracingCustomerId = dbUser.iracingCustomerId
          token.expectationsVersion = dbUser.expectationsVersion
          token.version = SESSION_VERSION
          token.lastChecked = Date.now()
        } else {
          logger.warn(`Failed to find user in DB during refresh: ${token.id}`)
        }
      }

      return token
    },
    // The session() callback from authConfig is inherited automatically
  },
  events: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && profile && user.id) {
        logger.info(`Syncing profile for ${user.email}`)
        const discordId = profile.id as string
        const membership = takePendingMembership(discordId)
        try {
          await syncDiscordProfile(user.id, profile, membership)
        } catch (error) {
          logger.error({ err: error }, 'Failed to sync profile')
        }
      }
    },
    async linkAccount({ user }) {
      logger.info(`Account linked for user ${user.id}`)
    },
  },
})
