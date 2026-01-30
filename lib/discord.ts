
import { features } from '@/lib/config'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

/**
 * Checks if a user is a member of the configured Discord guild.
 * Requires DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to be set.
 *
 * @param userId The Discord User ID to check
 * @returns true if member, false if not or error
 */
export async function checkGuildMembership(userId: string): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID

  // If variables are missing, we can't perform the check.
  // In a strict environment, this might default to false, but for now we'll log warnings.
  if (!botToken || !guildId) {
    console.warn('⚠️ Discord membership check skipped: DISCORD_BOT_TOKEN or DISCORD_GUILD_ID missing')
    return false // Default to blocking if misconfigured for security
  }

  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.ok) {
      return true
    } else if (response.status === 404) {
      return false
    } else {
      console.error(
        `Discord API error checking membership for ${userId}: ${response.status} ${response.statusText}`
      )
      return false
    }
  } catch (error) {
    console.error('Failed to check Discord guild membership:', error)
    return false
  }
}
