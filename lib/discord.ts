const DISCORD_API_BASE = 'https://discord.com/api/v10'
import { appTitle } from './config'

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
  nick?: string | null
  user?: { id: string; username: string; discriminator?: string; avatar?: string } | null
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
        nick: data.nick || null,
        user: data.user || null,
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

/**
 * Diagnostic function to verify the notifications channel is accessible.
 */
export async function verifyNotificationsChannel(): Promise<{ name: string } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID

  if (!botToken || !channelId) return null

  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}`, {
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
        `❌ Discord Notifications Channel Access Failed: ${response.status} ${response.statusText}`,
        text
      )
      return null
    }
  } catch (error) {
    console.error('❌ Failed to connect to Discord API during channel verification:', error)
    return null
  }
}

interface RegistrationNotificationData {
  userName: string
  userAvatarUrl?: string
  eventName: string
  raceStartTime: Date
  carClassName: string
  eventUrl: string
  discordUser?: { id: string; name: string }
}

interface OnboardingNotificationData {
  userName: string
  userAvatarUrl?: string
  iracingCustomerId: string
  iracingName?: string
  profileUrl: string
  discordUser?: { id: string; name: string }
}

/**
 * Sends a Discord notification when a user registers for a race.
 * Uses the bot token to send messages to a configured channel.
 * Requires DISCORD_BOT_TOKEN and DISCORD_NOTIFICATIONS_CHANNEL_ID to be set.
 */
export async function sendRegistrationNotification(
  data: RegistrationNotificationData
): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID

  if (!botToken || !channelId) {
    console.warn(
      '⚠️ Discord registration notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  try {
    const unixTimestamp = Math.floor(data.raceStartTime.getTime() / 1000)
    const discordTimestamp = `<t:${unixTimestamp}:F>`

    const embed: {
      title: string
      description: string
      color: number
      fields: Array<{ name: string; value: string; inline: boolean }>
      url: string
      timestamp: string
      footer: { text: string }
      thumbnail?: { url: string }
    } = {
      title: '🏁 New Race Registration',
      description: data.discordUser
        ? `<@${data.discordUser.id}> has registered for **${data.eventName}**`
        : `**${data.userName}** has registered for **${data.eventName}**`,
      color: 0x5865f2, // Discord blurple color
      fields: [
        {
          name: '🏎️ Car Class',
          value: data.carClassName,
          inline: true,
        },
        {
          name: '🕐 Race Time',
          value: discordTimestamp,
          inline: true,
        },
      ],
      url: data.eventUrl,
      timestamp: new Date().toISOString(),
      footer: {
        text: appTitle,
      },
    }

    if (data.userAvatarUrl) {
      embed.thumbnail = {
        url: data.userAvatarUrl,
      }
    }

    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [embed],
        flags: 4096, // Suppress notifications (silent)
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `Failed to send Discord registration notification: ${response.status} ${response.statusText}`,
        errorText
      )
      return false
    }

    return true
  } catch (error) {
    console.error('Error sending Discord registration notification:', error)
    return false
  }
}

/**
 * Sends a Discord notification when a user completes onboarding.
 * Requires DISCORD_BOT_TOKEN and DISCORD_NOTIFICATIONS_CHANNEL_ID to be set.
 */
export async function sendOnboardingNotification(
  data: OnboardingNotificationData
): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID

  if (!botToken || !channelId) {
    console.warn(
      '⚠️ Discord onboarding notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  try {
    const embed: {
      title: string
      description: string
      color: number
      fields: Array<{ name: string; value: string; inline: boolean }>
      url: string
      timestamp: string
      footer: { text: string }
      thumbnail?: { url: string }
    } = {
      title: '👋 New User Onboarded',
      description: data.discordUser
        ? `<@${data.discordUser.id}> has completed the onboarding process.`
        : `**${data.userName}** has completed the onboarding process.`,
      color: 0x00ff00, // Green
      fields: [
        {
          name: '🆔 iRacing ID',
          value: data.iracingCustomerId,
          inline: true,
        },
      ],
      url: data.profileUrl,
      timestamp: new Date().toISOString(),
      footer: {
        text: appTitle,
      },
    }

    if (data.iracingName) {
      embed.fields.push({
        name: '🏎️ iRacing Name',
        value: data.iracingName,
        inline: true,
      })
    }

    if (data.userAvatarUrl) {
      embed.thumbnail = {
        url: data.userAvatarUrl,
      }
    }

    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [embed],
        flags: 4096, // Suppress notifications (silent)
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `Failed to send Discord onboarding notification: ${response.status} ${response.statusText}`,
        errorText
      )
      return false
    }

    return true
  } catch (error) {
    console.error('Error sending Discord onboarding notification:', error)
    return false
  }
}

interface WeeklyScheduleEvent {
  name: string
  track: string
  startTime: Date
  endTime: Date
  raceTimes: Date[]
  tempValue?: number | null
  precipChance?: number | null
  carClasses: string[]
  registeredUsers: { name: string; discordId?: string }[]
  eventUrl: string
}

/**
 * Sends a weekly schedule notification with upcoming events for the weekend.
 */
export async function sendWeeklyScheduleNotification(
  events: WeeklyScheduleEvent[]
): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID

  if (!botToken || !channelId) {
    console.warn(
      '⚠️ Discord weekly schedule notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  if (events.length === 0) {
    return false
  }

  try {
    const embeds = events.map((event) => {
      // Determine weather string
      let weather = 'Unknown'
      if (typeof event.tempValue === 'number') {
        weather = `${event.tempValue}°F`
        if (typeof event.precipChance === 'number') {
          weather += `, ${event.precipChance}% Rain`
        }
      }

      // Format lists
      const raceTimesList = event.raceTimes
        .sort((a, b) => a.getTime() - b.getTime())
        .map((time) => {
          const unix = Math.floor(time.getTime() / 1000)
          return `• <t:${unix}:F>`
        })
        .join('\n')

      const classesList = event.carClasses
        .sort()
        .map((c) => `• ${c}`)
        .join('\n')

      const usersList =
        event.registeredUsers.length > 0
          ? event.registeredUsers
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((u) => (u.discordId ? `• <@${u.discordId}>` : `• ${u.name}`))
              .join('\n')
          : '• 👻 _No registrations yet — be the first!_'

      const description = [
        `🏟️ **Track:** ${event.track}`,
        `🌤️ **Weather:** ${weather}`,
        '',
        `🕐 **Race Times:**`,
        raceTimesList,
        '',
        `🏎️ **Classes:**`,
        classesList,
        '',
        `👥 **Registered Drivers:**`,
        usersList,
      ].join('\n')

      return {
        title: `📅 ${event.name}`,
        url: event.eventUrl,
        description,
        color: 0x3498db, // Blue
      }
    })

    // Discord allows up to 10 embeds per message.
    const chunks = []
    for (let i = 0; i < embeds.length; i += 10) {
      chunks.push(embeds.slice(i, i + 10))
    }

    for (const chunk of chunks) {
      await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: chunk === chunks[0] ? '**Upcoming Races for this Weekend** 🏁' : undefined,
          embeds: chunk,
          flags: 4096, // Suppress notifications (silent)
        }),
      })
    }

    return true
  } catch (error) {
    console.error('Error sending Discord weekly schedule notification:', error)
    return false
  }
}
