import prisma from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import {
  ACCESS_TOKEN_MAX_AGE_MS,
  CURRENT_EXPECTATIONS_VERSION,
  SESSION_VERSION,
  features,
} from '@/lib/config'
import type { JWT } from 'next-auth/jwt'
import { createLogger } from '@/lib/logger'
import type { GuildMembershipResult, GuildMembershipStatus } from '@/lib/discord'

const logger = createLogger('auth-service')

export type MembershipVerification =
  { granted: true; data: GuildMembershipResult } | { granted: false; redirectUrl: string }

export interface UserRefreshData {
  role: UserRole
  iracingCustomerId: number | null
  expectationsVersion: number
}

export interface RevalidatedUserData extends UserRefreshData {
  name: string | null
}

export type AccessRevalidationResult =
  | {
      status: 'valid'
      discordId: string
      user: RevalidatedUserData
      verifiedAt: number
    }
  | { status: 'revoked'; reason: GuildMembershipStatus }
  | { status: 'skipped'; verifiedAt: number }

type DiscordCheckOutcome =
  | {
      status: 'member'
      discordId: string
      roles?: string[]
      nick?: string | null
      verifiedAt: number
    }
  | { status: 'revoked'; reason: GuildMembershipStatus }
  | { status: 'skipped'; verifiedAt: number }

const REVALIDATION_CACHE_TTL_MS = 60_000
const MAX_REVALIDATION_CACHE_SIZE = 500
// Process-local deduplication and short-lived caching of external Discord API checks.
// On multi-instance deployments each container maintains its own cache, so at most
// one Discord lookup per container can occur during the 60s window after token expiry.
const inFlightDiscordChecks = new Map<string, Promise<DiscordCheckOutcome>>()
const recentDiscordChecks = new Map<string, { outcome: DiscordCheckOutcome; cachedAt: number }>()

/**
 * Clears in-memory revalidation deduplication/caching state (primarily for tests).
 */
export function clearRevalidationCache(): void {
  inFlightDiscordChecks.clear()
  recentDiscordChecks.clear()
}

/**
 * Maps a Discord member's role IDs against `DISCORD_ADMIN_ROLE_IDS`.
 */
export function resolveRoleFromDiscordRoles(roles?: string[]): UserRole {
  const adminRoleIdsStr = process.env.DISCORD_ADMIN_ROLE_IDS || ''
  const adminRoleIds = adminRoleIdsStr
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const isAdmin = roles?.some((roleId) => adminRoleIds.includes(roleId)) ?? false
  return isAdmin ? UserRole.ADMIN : UserRole.USER
}

/**
 * Returns true when an access token has exceeded its standalone 1-hour validity
 * window and must re-check Discord guild membership and roles.
 */
export function shouldRevalidateAccess(token: JWT, trigger?: string): boolean {
  // Dev Mock Auth sessions bypass Discord guild verification only when mockAuth is enabled
  if (features.mockAuth && token.provider === 'credentials') return false

  // Initial sign-in/sign-up just verified guild membership in the signIn callback
  if (trigger === 'signIn' || trigger === 'signUp') return false

  const accessVerifiedAt = token.accessVerifiedAt
  if (
    typeof accessVerifiedAt !== 'number' ||
    !Number.isFinite(accessVerifiedAt) ||
    accessVerifiedAt <= 0
  ) {
    return true
  }

  return Date.now() - accessVerifiedAt >= ACCESS_TOKEN_MAX_AGE_MS
}

/**
 * Checks if a user's session token needs to be refreshed from the database.
 *
 * We refresh if:
 * 1. There is an explicit trigger (like signIn or update)
 * 2. The session version is outdated
 * 3. The user is missing critical onboarding data (may have just been saved)
 * 4. The periodic 5-minute DB check interval has elapsed
 */
export function shouldRefreshUser(token: JWT, trigger?: string): boolean {
  // 1. Refresh on explicit triggers (signIn, update)
  if (trigger) return true

  // 2. Refresh if the session schema/version is outdated
  if (((token.version as number) || 0) < SESSION_VERSION) return true

  // 3. Refresh if expectations are outdated (user needs to re-agree)
  if (((token.expectationsVersion as number) || 0) < CURRENT_EXPECTATIONS_VERSION) return true

  // 4. Refresh if iracingCustomerId is missing (may have just been saved)
  if (!token.iracingCustomerId) return true

  // 5. Periodic Sync: Refresh if the last DB check was more than 5 minutes ago
  // This catches role changes made by admins or Discord syncs
  const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
  const lastChecked = (token.lastChecked as number) || 0
  if (Date.now() - lastChecked > REFRESH_INTERVAL) return true

  return false
}

/**
 * Fetches the latest user data for JWT refreshing.
 */
export async function refreshUserData(userId: string): Promise<UserRefreshData | null> {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, iracingCustomerId: true, expectationsVersion: true },
  })
}

async function performDiscordCheck(
  userId: string,
  discordIdFromToken?: string
): Promise<{ outcome: DiscordCheckOutcome; cacheable: boolean }> {
  const { GuildMembershipStatus, checkGuildMembership } = await import('@/lib/discord')

  let resolvedDiscordId = discordIdFromToken
  if (!resolvedDiscordId) {
    const discordAccount = await prisma.account.findFirst({
      where: { userId, provider: 'discord' },
      select: { providerAccountId: true },
    })
    resolvedDiscordId = discordAccount?.providerAccountId
  }

  if (!resolvedDiscordId) {
    // Only allow skipping Discord verification when dev Mock Auth is enabled.
    // In production, a missing Discord account must fail closed.
    if (features.mockAuth) {
      return { outcome: { status: 'skipped', verifiedAt: Date.now() }, cacheable: true }
    }
    logger.warn({ userId }, '[revalidateDiscordAccess] Missing Discord account; revoking session')
    return {
      outcome: { status: 'revoked', reason: GuildMembershipStatus.NOT_MEMBER },
      cacheable: true,
    }
  }

  const membership = await checkGuildMembership(resolvedDiscordId)

  if (membership.status !== GuildMembershipStatus.MEMBER) {
    const isNotMember = membership.status === GuildMembershipStatus.NOT_MEMBER
    const level = isNotMember ? 'info' : 'warn'
    logger[level](
      { userId, discordId: resolvedDiscordId, status: membership.status },
      '[revalidateDiscordAccess] Revoking expired access token'
    )
    // Only cache confirmed guild removals; transient API/config errors should retry immediately
    return {
      outcome: { status: 'revoked', reason: membership.status },
      cacheable: isNotMember,
    }
  }

  return {
    outcome: {
      status: 'member',
      discordId: resolvedDiscordId,
      roles: membership.roles,
      nick: membership.nick,
      verifiedAt: Date.now(),
    },
    cacheable: true,
  }
}

async function checkDiscordAccessCached(
  userId: string,
  discordIdFromToken?: string
): Promise<DiscordCheckOutcome> {
  const now = Date.now()
  const cached = recentDiscordChecks.get(userId)
  if (cached) {
    if (now - cached.cachedAt < REVALIDATION_CACHE_TTL_MS) {
      return cached.outcome
    }
    recentDiscordChecks.delete(userId)
  }

  const existing = inFlightDiscordChecks.get(userId)
  if (existing) {
    return existing
  }

  const promise = performDiscordCheck(userId, discordIdFromToken)
    .then(({ outcome, cacheable }) => {
      if (cacheable) {
        // Delete before re-inserting so insertion order reflects recency
        recentDiscordChecks.delete(userId)
        if (recentDiscordChecks.size >= MAX_REVALIDATION_CACHE_SIZE) {
          const oldestKey = recentDiscordChecks.keys().next().value
          if (oldestKey !== undefined) {
            recentDiscordChecks.delete(oldestKey)
          }
        }
        recentDiscordChecks.set(userId, { outcome, cachedAt: Date.now() })
      }
      return outcome
    })
    .finally(() => {
      inFlightDiscordChecks.delete(userId)
    })

  inFlightDiscordChecks.set(userId, promise)
  return promise
}

/**
 * Re-verifies Discord guild membership and syncs roles once the 1-hour access
 * token window expires. Deduplicates concurrent Discord checks and caches the
 * external Discord result briefly so parallel RSC renders and follow-up cookie
 * sync requests share one Discord API call while always reading fresh DB state.
 */
export async function revalidateDiscordAccess(
  userId: string,
  discordIdFromToken?: string
): Promise<AccessRevalidationResult> {
  const discordCheck = await checkDiscordAccessCached(userId, discordIdFromToken)

  if (discordCheck.status === 'skipped') {
    return { status: 'skipped', verifiedAt: discordCheck.verifiedAt }
  }

  if (discordCheck.status === 'revoked') {
    return { status: 'revoked', reason: discordCheck.reason }
  }

  const { GuildMembershipStatus } = await import('@/lib/discord')
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, name: true, iracingCustomerId: true, expectationsVersion: true },
  })

  if (!dbUser) {
    logger.warn({ userId }, '[revalidateDiscordAccess] User not found in DB; revoking session')
    return { status: 'revoked', reason: GuildMembershipStatus.NOT_MEMBER }
  }

  const targetRole = resolveRoleFromDiscordRoles(discordCheck.roles)
  const shouldUpdateName = Boolean(discordCheck.nick && dbUser.name !== discordCheck.nick)
  const shouldUpdateRole = dbUser.role !== targetRole

  let latestUser: RevalidatedUserData = {
    role: dbUser.role,
    name: dbUser.name,
    iracingCustomerId: dbUser.iracingCustomerId,
    expectationsVersion: dbUser.expectationsVersion,
  }

  if (shouldUpdateRole || shouldUpdateName) {
    latestUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(shouldUpdateRole ? { role: targetRole } : {}),
        ...(shouldUpdateName ? { name: discordCheck.nick as string } : {}),
      },
      select: { role: true, name: true, iracingCustomerId: true, expectationsVersion: true },
    })
  }

  return {
    status: 'valid',
    discordId: discordCheck.discordId,
    user: latestUser,
    verifiedAt: discordCheck.verifiedAt,
  }
}

/**
 * Syncs a user's profile with their current Discord information.
 *
 * Pass `membershipData` (from a prior `verifyGuildMembership` call) to reuse
 * the already-fetched result and avoid a second Discord API call.
 */
export async function syncDiscordProfile(
  userId: string,
  profile: { id?: string | null; [key: string]: unknown },
  membershipData?: GuildMembershipResult
) {
  try {
    const { GuildMembershipStatus, checkGuildMembership } = await import('@/lib/discord')
    const { status, roles, nick } =
      membershipData ?? (await checkGuildMembership(profile.id as string))

    const targetRole = resolveRoleFromDiscordRoles(roles)

    // Only update name when we have confirmed guild member data. On API_ERROR or
    // CONFIG_ERROR, nick is undefined even if the user has a server nickname, so
    // we skip the name field to preserve whatever is already stored in the DB.
    const nameUpdate =
      status === GuildMembershipStatus.MEMBER
        ? { name: (nick || profile.name || profile.username) as string | undefined }
        : {}

    // Update the user record with latest info from Discord
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: targetRole,
        ...nameUpdate,
        image: (profile.image_url || profile.avatar) as string | undefined,
      },
    })

    recentDiscordChecks.delete(userId)

    return updatedUser
  } catch (error) {
    logger.error({ err: error }, '[syncDiscordProfile] Failed to sync')
    throw error
  }
}

/**
 * Verifies if a Discord user is a member of the required guild.
 * Returns the full membership data on success so the caller can pass it
 * to syncDiscordProfile without a second Discord API call.
 */
export async function verifyGuildMembership(discordId: string): Promise<MembershipVerification> {
  const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
  const data = await checkGuildMembership(discordId)

  if (data.status !== GuildMembershipStatus.MEMBER) {
    const level = data.status === GuildMembershipStatus.NOT_MEMBER ? 'info' : 'warn'
    logger[level](`[verifyGuildMembership] Denying access: ${data.status}`)
    return { granted: false, redirectUrl: `/not-found?error=${data.status}` }
  }

  return { granted: true, data }
}
