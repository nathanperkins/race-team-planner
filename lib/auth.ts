import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from './prisma'
import { authConfig } from './auth.config'
import Credentials from 'next-auth/providers/credentials'
import { features, SESSION_VERSION } from '@/lib/config'
import { AUTH_ERROR_EMAIL_REQUIRED } from '@/lib/auth-errors'
import {
  verifyGuildMembership,
  shouldRevalidateAccess,
  revalidateDiscordAccess,
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

      // 2. Perform Confirmed Email & Guild Membership Checks for Discord
      if (account?.provider === 'discord') {
        if (!profile?.id) {
          logger.error('Discord sign-in attempted without a profile ID')
          return false
        }

        const hasEmail = typeof profile.email === 'string' && profile.email.trim().length > 0
        const isVerified = profile.verified === true
        if (!hasEmail || !isVerified) {
          logger.info(
            {
              discordId: profile.id,
              hasEmail,
              verified: isVerified,
            },
            'Discord sign-in denied: confirmed email required'
          )
          return `/not-found?error=${AUTH_ERROR_EMAIL_REQUIRED}`
        }

        const check = await verifyGuildMembership(profile.id as string)
        if (!check.granted) return check.redirectUrl
        setPendingMembership(profile.id as string, check.data)
        return true
      }

      return true
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      // 1. Run base mapping from authConfig
      if (authConfig.callbacks?.jwt) {
        const baseToken = await authConfig.callbacks.jwt({
          token,
          user,
          trigger,
          session,
          account,
          profile,
        })
        if (!baseToken) return null
        token = baseToken
      }

      // Reset any previously persisted cookie-refresh hint; it is only re-enabled
      // below if this request actually performs an expired-token revalidation.
      token.needsCookieRefresh = false

      const userId = (token.id as string | undefined) || token.sub

      // 2. Access Token Expiration: Re-verify Discord guild membership and refresh roles after 1 hour
      if (userId && shouldRevalidateAccess(token, trigger)) {
        logger.debug(`Revalidating Discord access for user ${userId} (trigger: ${trigger})`)
        const revalidation = await revalidateDiscordAccess(userId, token.discordId)

        if (revalidation.status === 'revoked') {
          return null
        }

        if (revalidation.status === 'valid') {
          token.id = userId
          token.role = revalidation.user.role
          if (revalidation.user.name) {
            token.name = revalidation.user.name
          }
          token.iracingCustomerId = revalidation.user.iracingCustomerId
          token.expectationsVersion = revalidation.user.expectationsVersion
          token.discordId = revalidation.discordId
          token.provider = 'discord'
          token.version = SESSION_VERSION
          token.accessVerifiedAt = revalidation.verifiedAt
          token.lastChecked = revalidation.verifiedAt
          token.needsCookieRefresh = trigger !== 'update'
          return token
        }

        // Skipped (only possible when features.mockAuth is enabled for dev credentials users)
        token.id = userId
        token.provider = token.provider || 'credentials'
        token.accessVerifiedAt = revalidation.verifiedAt
        token.needsCookieRefresh = trigger !== 'update'
      }

      // 3. Auto-heal: Refresh from DB if info is missing OR if we're explicitly updating.
      if (userId && shouldRefreshUser(token, trigger)) {
        logger.debug(`Refreshing data for user ${userId} (trigger: ${trigger})`)
        const dbUser = await refreshUserData(userId)
        if (dbUser) {
          logger.debug(`Found DB user. ID: ${dbUser.iracingCustomerId}, Role: ${dbUser.role}`)
          token.id = userId
          token.role = dbUser.role
          token.iracingCustomerId = dbUser.iracingCustomerId
          token.expectationsVersion = dbUser.expectationsVersion
          token.version = SESSION_VERSION
          token.lastChecked = Date.now()
        } else {
          logger.warn(`Failed to find user in DB during refresh: ${userId}`)
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
