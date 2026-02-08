import prisma from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { CURRENT_EXPECTATIONS_VERSION, SESSION_VERSION } from '@/lib/config'
import type { JWT } from 'next-auth/jwt'

export interface UserRefreshData {
  role: UserRole
  iracingCustomerId: number | null
  expectationsVersion: number
}

/**
 * Checks if a user's session token needs to be refreshed from the database.
 *
 * We refresh if:
 * 1. There is an explicit trigger (like signIn or update)
 * 2. The session version is outdated
 * 3. The user is missing critical onboarding data (may have just been saved)
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

/**
 * Syncs a user's profile with their current Discord information.
 */
export async function syncDiscordProfile(
  userId: string,
  profile: { id?: string | null; [key: string]: unknown }
) {
  try {
    const { checkGuildMembership } = await import('@/lib/discord')
    const { roles, nick } = await checkGuildMembership(profile.id as string)

    const adminRoleIdsStr = process.env.DISCORD_ADMIN_ROLE_IDS || ''
    const adminRoleIds = adminRoleIdsStr.split(',').map((id) => id.trim())
    const isAdmin = roles?.some((roleId) => adminRoleIds.includes(roleId))
    const targetRole = isAdmin ? UserRole.ADMIN : UserRole.USER

    // Update the user record with latest info from Discord
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        role: targetRole,
        name: (nick || profile.name || profile.username) as string | undefined,
        image: (profile.image_url || profile.avatar) as string | undefined,
      },
    })

    return updatedUser
  } catch (error) {
    console.error('[auth-service][syncDiscordProfile] Failed to sync:', error)
    throw error
  }
}

/**
 * Verifies if a Discord user is a member of the required guild.
 */
export async function verifyGuildMembership(discordId: string): Promise<string | boolean> {
  const { checkGuildMembership, GuildMembershipStatus } = await import('@/lib/discord')
  const { status } = await checkGuildMembership(discordId)

  if (status !== GuildMembershipStatus.MEMBER) {
    console.log(`[auth-service][verifyGuildMembership] Denying access: ${status}`)
    return `/not-found?error=${status}`
  }

  return true
}
