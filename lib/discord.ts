const DISCORD_API_BASE = 'https://discord.com/api/v10'

export enum GuildMembershipStatus {
  MEMBER = 'member',
  NOT_MEMBER = 'access_denied_guild_membership',
  CONFIG_ERROR = 'config_error',
  API_ERROR = 'api_error',
}

/**
 * Checks if a user is a member of the configured Discord guild.
 * Requires DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to be set.
 *
 * @param userId The Discord User ID to check
 * @returns Object with status and user roles
 */
export async function checkGuildMembership(userId: string): Promise<{
  status: GuildMembershipStatus
  roles?: string[]
}> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID

  if (!botToken || !guildId) {
    console.warn(
      '⚠️ Discord membership check skipped: DISCORD_BOT_TOKEN or DISCORD_GUILD_ID missing'
    )
    return { status: GuildMembershipStatus.CONFIG_ERROR }
  }

  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      return {
        status: GuildMembershipStatus.MEMBER,
        roles: data.roles || [],
      }
    } else if (response.status === 404) {
      return { status: GuildMembershipStatus.NOT_MEMBER }
    } else {
      console.error(
        `Discord API error checking membership for ${userId}: ${response.status} ${response.statusText}`
      )
      return { status: GuildMembershipStatus.API_ERROR }
    }
  } catch (error) {
    console.error('Failed to check Discord guild membership:', error)
    return { status: GuildMembershipStatus.API_ERROR }
  }
}

/**
 * Diagnostic function to check if the Bot Token is valid and what bot it belongs to.
 */
export async function verifyBotToken(): Promise<{ name: string; id: string } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) return null

  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      return { name: data.username, id: data.id }
    } else {
      const text = await response.text()
      console.error(
        `❌ Discord Token Verification Failed: ${response.status} ${response.statusText}`,
        text
      )
      return null
    }
  } catch (error) {
    console.error('❌ Failed to connect to Discord API during verification:', error)
    return null
  }
}

/**
 * Diagnostic function to check if the bot can access the configured guild.
 */
export async function verifyGuildAccess(): Promise<{ name: string } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID

  if (!botToken || !guildId) return null

  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.ok) {
      const data = await response.json()
      return { name: data.name }
    } else {
      const text = await response.text()
      console.error(
        `❌ Discord Guild Access Failed: ${response.status} ${response.statusText}`,
        text
      )
      return null
    }
  } catch (error) {
    console.error('❌ Failed to connect to Discord API during guild verification:', error)
    return null
  }
}

interface DiscordRole {
  id: string
  name: string
}

/**
 * Diagnostic function to verify configured admin roles.
 */
export async function verifyAdminRoles(): Promise<string[]> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  const adminRoleIdsStr = process.env.DISCORD_ADMIN_ROLE_IDS

  if (!botToken || !guildId || !adminRoleIdsStr) return []

  const adminRoleIds = adminRoleIdsStr.split(',').map((id) => id.trim())

  try {
    const response = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (response.ok) {
      const roles: DiscordRole[] = await response.json()
      const foundRoles = roles.filter((r) => adminRoleIds.includes(r.id)).map((r) => r.name)
      return foundRoles
    } else {
      console.error(`❌ Discord Admin Role Verification Failed: ${response.status}`)
      return []
    }
  } catch (error) {
    console.error('❌ Failed to connect to Discord API during role verification:', error)
    return []
  }
}
