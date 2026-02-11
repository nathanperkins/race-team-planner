import { appTitle, appLocale, appTimeZone } from './config'
import {
  OnboardingNotificationData,
  RegistrationNotificationData,
  TeamsAssignedNotificationData,
  WeeklyScheduleEvent,
  buildOnboardingEmbed,
  buildRegistrationEmbed,
  chunkLines,
  formatTeamLines,
  normalizeSeriesName,
} from './discord-utils'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

async function doesDiscordThreadExist(options: { threadId: string; botToken: string }) {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${options.threadId}`, {
      headers: {
        Authorization: `Bot ${options.botToken}`,
      },
    })

    if (response.status === 404) {
      return false
    }

    if (!response.ok) {
      console.warn(
        `⚠️ [Discord] Unable to verify thread ${options.threadId}: ${response.status} ${response.statusText}`
      )
    }

    return true
  } catch (error) {
    // Treat transient API failures as "exists" to avoid creating duplicate threads.
    console.warn(`⚠️ [Discord] Failed to verify thread ${options.threadId}:`, error)
    return true
  }
}

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

/**
 * Diagnostic function to verify the events forum is accessible if configured.
 */
export async function verifyEventsForum(): Promise<{ name: string } | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID

  if (!botToken || !forumId) return null

  try {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${forumId}`, {
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
        `❌ Discord Events Forum Access Failed: ${response.status} ${response.statusText}`,
        text
      )
      return null
    }
  } catch (error) {
    console.error('❌ Failed to connect to Discord API during forum verification:', error)
    return null
  }
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
      'Discord registration notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  try {
    const embed = buildRegistrationEmbed(data, appTitle)

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

    if (data.threadId && data.threadId !== channelId) {
      const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${data.threadId}/messages`, {
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

      if (!threadResponse.ok) {
        const threadErrorText = await threadResponse.text()
        console.error(
          `Failed to send Discord registration notification to thread ${data.threadId}: ${threadResponse.status} ${threadResponse.statusText}`,
          threadErrorText
        )
      }
    }

    console.log(`Registration notification sent for ${data.userName} in ${data.eventName}`)
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
    const embed = buildOnboardingEmbed(data, appTitle)

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

    console.log(`✅ [Discord] Onboarding notification sent for ${data.userName}`)
    return true
  } catch (error) {
    console.error('Error sending Discord onboarding notification:', error)
    return false
  }
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
    const { buildWeeklyScheduleEmbeds } = await import('./discord-utils')
    const embeds = buildWeeklyScheduleEmbeds(events)

    // Discord allows up to 10 embeds per message.
    const chunks = []
    for (let i = 0; i < embeds.length; i += 10) {
      chunks.push(embeds.slice(i, i + 10))
    }

    for (const chunk of chunks) {
      const resp = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
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
      if (resp.ok) {
        console.log(
          `✅ [Discord] Weekly schedule chunk ${chunks.indexOf(chunk) + 1}/${chunks.length} sent`
        )
      }
    }

    return true
  } catch (error) {
    console.error('Error sending Discord weekly schedule notification:', error)
    return false
  }
}

/**
 * Sends a Discord notification when teams are assigned for a race.
 * Creates a new thread and posts the team composition inside.
 *
 * This function handles the "Technical Execution":
 * 1. Formats the raw payload (Embeds, Timestamps, Mention lists).
 * 2. Interacts with the Discord API (fetch, error handling).
 * 3. Handles Discord-specific nuances like Public vs Forum threads.
 * 4. This layer knows NOTHING about Prisma or our database state.
 */
export async function sendTeamsAssignedNotification(
  data: TeamsAssignedNotificationData
): Promise<{ ok: boolean; threadId?: string }> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID
  const guildId = process.env.DISCORD_GUILD_ID

  if (!botToken || !channelId) {
    console.warn(
      '⚠️ Discord teams notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return { ok: false }
  }

  const threadParentId = forumId || channelId

  try {
    const unixTimestamp = Math.floor(data.raceStartTime.getTime() / 1000)
    const discordTimestamp = `<t:${unixTimestamp}:F>`
    const cleanName = normalizeSeriesName(data.eventName)
    const dateLabel = new Intl.DateTimeFormat(appLocale, {
      month: 'numeric',
      day: 'numeric',
      timeZone: appTimeZone,
    }).format(data.raceStartTime)
    const timeLabel = new Intl.DateTimeFormat(appLocale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: appTimeZone,
    }).format(data.raceStartTime)
    const threadName = `${cleanName} (${dateLabel} - ${timeLabel})`
    const allMentionIds = new Set<string>()
    data.teams.forEach((team) => {
      team.members.forEach((member) => {
        if (member.registrationId && member.discordId) {
          allMentionIds.add(member.registrationId)
        }
      })
    })
    data.unassigned?.forEach((member) => {
      if (member.registrationId && member.discordId) {
        allMentionIds.add(member.registrationId)
      }
    })
    const buildEmbeds = () => {
      const lines = formatTeamLines(data.teams, data.unassigned)
      const chunks = chunkLines(lines, 3800)
      return chunks.map((chunk, index) => {
        const embed: {
          title: string
          description: string
          color: number
          url: string
          timestamp: string
          footer: { text: string }
          fields?: Array<{ name: string; value: string; inline: boolean }>
        } = {
          title: index === 0 ? '🏁 Teams Assigned' : '🏁 Teams Assigned (cont.)',
          description: chunk,
          color: 0x5865f2, // Blurple
          url: data.raceUrl,
          timestamp: new Date().toISOString(),
          footer: {
            text: appTitle,
          },
        }

        if (index === 0) {
          const fields = [
            {
              name: '🏎️ Event',
              value: data.eventName,
              inline: true,
            },
            {
              name: '🕐 Race Time',
              value: discordTimestamp,
              inline: true,
            },
          ]

          if (data.track) {
            let trackVal = data.track
            if (data.trackConfig) trackVal += ` (${data.trackConfig})`
            fields.push({
              name: '🏟️ Track',
              value: trackVal,
              inline: true,
            })
          }

          if (typeof data.tempValue === 'number') {
            let weather = `${data.tempValue}°F`
            if (typeof data.precipChance === 'number') {
              weather += `, ${data.precipChance}% Rain`
            }
            fields.push({
              name: '🌤️ Weather',
              value: weather,
              inline: true,
            })
          }

          embed.fields = fields
        }

        return embed
      })
    }

    let threadId = data.threadId ?? null
    if (threadId) {
      const exists = await doesDiscordThreadExist({ threadId, botToken })
      if (!exists) {
        console.warn(`⚠️ [Discord] Teams thread ${threadId} missing; creating a new one`)
        threadId = null
      }
    }

    const upsertThreadMessage = async (
      id: string,
      embeds: ReturnType<typeof buildEmbeds>,
      mentionSet: Set<string>
    ) => {
      const allDiscordIds = new Map<string, string>()
      data.teams.forEach((team) => {
        team.members.forEach((member) => {
          if (member.registrationId && member.discordId) {
            allDiscordIds.set(member.registrationId, member.discordId)
          }
        })
      })
      data.unassigned?.forEach((member) => {
        if (member.registrationId && member.discordId) {
          allDiscordIds.set(member.registrationId, member.discordId)
        }
      })
      const mentionList = Array.from(mentionSet)
        .map((regId) => allDiscordIds.get(regId))
        .filter((id): id is string => Boolean(id))
        .map((id) => `<@${id}>`)
      const allowedIds = Array.from(mentionSet)
        .map((regId) => allDiscordIds.get(regId))
        .filter((id): id is string => Boolean(id))
      const content = mentionList.length ? mentionList.join(' ') : undefined
      const payload = {
        content,
        embeds,
        allowed_mentions: { users: allowedIds, parse: [] as string[] },
      }

      const messagesResponse = await fetch(`${DISCORD_API_BASE}/channels/${id}/messages?limit=25`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      })
      if (!messagesResponse.ok) {
        if (messagesResponse.status === 404) {
          return messagesResponse
        }
        const errorText = await messagesResponse.text()
        console.warn(
          `Failed to read messages in thread ${id} before update: ${messagesResponse.status} ${messagesResponse.statusText}`,
          errorText
        )
      } else {
        const messages = await messagesResponse.json()
        const existingTeamsMessage = Array.isArray(messages)
          ? messages.find(
              (message: { embeds?: Array<{ title?: string }>; author?: { bot?: boolean } }) => {
                const embeds = Array.isArray(message?.embeds) ? message.embeds : []
                const hasTeamsEmbed = embeds.some(
                  (embed: { title?: string }) =>
                    typeof embed?.title === 'string' && embed.title.startsWith('🏁 Teams Assigned')
                )
                const isBotMessage = message?.author?.bot !== false
                return hasTeamsEmbed && isBotMessage
              }
            )
          : null

        if (existingTeamsMessage?.id) {
          const editResponse = await fetch(
            `${DISCORD_API_BASE}/channels/${id}/messages/${existingTeamsMessage.id}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bot ${botToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          )
          if (editResponse.ok || editResponse.status === 404) {
            return editResponse
          }
          const errorText = await editResponse.text()
          console.warn(
            `Failed to edit existing teams message ${existingTeamsMessage.id} in thread ${id}: ${editResponse.status} ${editResponse.statusText}`,
            errorText
          )
        }
      }

      const resp = await fetch(`${DISCORD_API_BASE}/channels/${id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      console.log(`[Discord] upsertThreadMessage response: ${resp.status} ${resp.statusText}`)
      return resp
    }

    let threadCreated = false
    if (!threadId) {
      threadCreated = true
      const embeds = buildEmbeds()
      const discordIds = new Map<string, string>()
      data.teams.forEach((team) => {
        team.members.forEach((member) => {
          if (member.registrationId && member.discordId) {
            discordIds.set(member.registrationId, member.discordId)
          }
        })
      })
      data.unassigned?.forEach((member) => {
        if (member.registrationId && member.discordId) {
          discordIds.set(member.registrationId, member.discordId)
        }
      })
      const mentionList = Array.from(allMentionIds)
        .map((regId) => discordIds.get(regId))
        .filter((id): id is string => Boolean(id))
        .map((id) => `<@${id}>`)
      const allowedIds = Array.from(allMentionIds)
        .map((regId) => discordIds.get(regId))
        .filter((id): id is string => Boolean(id))
      const content = mentionList.length ? mentionList.join(' ') : undefined

      const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${threadParentId}/threads`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: threadName,
          auto_archive_duration: 10080,
          message: {
            content,
            embeds,
            allowed_mentions: { users: allowedIds, parse: [] },
          },
        }),
      })

      if (!threadResponse.ok) {
        const errorText = await threadResponse.text()
        let errorBody = {}
        try {
          errorBody = JSON.parse(errorText)
        } catch {
          errorBody = { raw: errorText }
        }
        console.error(
          `❌ [Discord] Failed to create thread in ${threadParentId}: ${threadResponse.status} ${threadResponse.statusText}`,
          JSON.stringify(errorBody, null, 2)
        )
        return { ok: false }
      }

      const thread = await threadResponse.json()
      threadId = thread.id
      console.log(`✅ [Discord] Created teams thread: ${threadId} in ${threadParentId}`)

      // Add all members to the thread
      const allMemberDiscordIds = Array.from(discordIds.values())
      if (threadId && allMemberDiscordIds.length > 0) {
        await addUsersToThread(threadId, allMemberDiscordIds)
      }

      // Send separate notification to the chat channel if using a forum
      if (forumId && threadId && guildId) {
        const threadUrl = `https://discord.com/channels/${guildId}/${threadId}`
        const chatResp = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            embeds: [
              {
                title: '🏁 Teams Assigned',
                description: `Teams have been assigned for **${data.eventName}**!`,
                color: 0x5865f2,
                url: threadUrl,
                fields: [
                  {
                    name: '🕐 Race Time',
                    value: discordTimestamp,
                    inline: true,
                  },
                  {
                    name: '🔗 Discussion',
                    value: `[View Team Thread](${threadUrl})`,
                    inline: true,
                  },
                ],
                timestamp: new Date().toISOString(),
                footer: {
                  text: appTitle,
                },
              },
            ],
          }),
        })
        if (chatResp.ok) {
          console.log(`✅ [Discord] Posted thread link to chat channel ${channelId}`)
        }
      }
    }

    if (!threadId) {
      return { ok: false }
    }

    if (!threadCreated) {
      const mentionSet = new Set(data.mentionRegistrationIds ?? [])
      const postResponse = await upsertThreadMessage(threadId, buildEmbeds(), mentionSet)
      if (!postResponse.ok && postResponse.status === 404) {
        // Thread deleted or inaccessible; create a new one.
        threadId = null
        threadCreated = true
        const embeds = buildEmbeds()
        const discordIds = new Map<string, string>()
        data.teams.forEach((team) => {
          team.members.forEach((member) => {
            if (member.registrationId && member.discordId) {
              discordIds.set(member.registrationId, member.discordId)
            }
          })
        })
        data.unassigned?.forEach((member) => {
          if (member.registrationId && member.discordId) {
            discordIds.set(member.registrationId, member.discordId)
          }
        })
        const mentionList = Array.from(allMentionIds)
          .map((regId) => discordIds.get(regId))
          .filter((id): id is string => Boolean(id))
          .map((id) => `<@${id}>`)
        const allowedIds = Array.from(allMentionIds)
          .map((regId) => discordIds.get(regId))
          .filter((id): id is string => Boolean(id))
        const content = mentionList.length ? mentionList.join(' ') : undefined

        const threadResponse = await fetch(
          `${DISCORD_API_BASE}/channels/${threadParentId}/threads`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: threadName,
              auto_archive_duration: 10080,
              message: {
                content,
                embeds,
                allowed_mentions: { users: allowedIds, parse: [] },
              },
            }),
          }
        )

        if (!threadResponse.ok) {
          const errorText = await threadResponse.text()
          let errorBody = {}
          try {
            errorBody = JSON.parse(errorText)
          } catch {
            errorBody = { raw: errorText }
          }
          console.error(
            `❌ [Discord] Failed to create thread in ${threadParentId} (fallback): ${threadResponse.status} ${threadResponse.statusText}`,
            JSON.stringify(errorBody, null, 2)
          )
          return { ok: false }
        }

        const thread = await threadResponse.json()
        threadId = thread.id
        if (!threadId) {
          return { ok: false }
        }

        // Send separate notification to the chat channel if using a forum
        if (forumId && threadId && guildId) {
          const threadUrl = `https://discord.com/channels/${guildId}/${threadId}`
          await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              embeds: [
                {
                  title: '🏁 Teams Assigned',
                  description: `Teams have been assigned for **${data.eventName}**!`,
                  color: 0x5865f2,
                  url: threadUrl,
                  fields: [
                    {
                      name: '🕐 Race Time',
                      value: discordTimestamp,
                      inline: true,
                    },
                    {
                      name: '🔗 Discussion',
                      value: `[View Team Thread](${threadUrl})`,
                      inline: true,
                    },
                  ],
                  timestamp: new Date().toISOString(),
                  footer: {
                    text: appTitle,
                  },
                },
              ],
            }),
          })
        }
      } else if (!postResponse.ok) {
        const errorText = await postResponse.text()
        console.error(
          `Failed to send Discord teams update: ${postResponse.status} ${postResponse.statusText}`,
          errorText
        )
        return { ok: false, threadId: threadId ?? undefined }
      }
    }

    return { ok: true, threadId: threadId ?? undefined }
  } catch (error) {
    console.error('Error sending teams assigned notification:', error)
    return { ok: false }
  }
}

export async function addUsersToThread(threadId: string, discordUserIds: string[]) {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    return
  }

  const uniqueIds = Array.from(new Set(discordUserIds)).filter(Boolean)
  for (const userId of uniqueIds) {
    try {
      const response = await fetch(
        `${DISCORD_API_BASE}/channels/${threadId}/thread-members/${userId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bot ${botToken}`,
          },
        }
      )

      if (!response.ok && response.status !== 409) {
        const errorText = await response.text()
        console.error(
          `Failed to add user ${userId} to thread ${threadId}: ${response.status} ${response.statusText}`,
          errorText
        )
      }
    } catch (error) {
      console.error(`Failed to add user ${userId} to thread ${threadId}:`, error)
    }
  }
}

export function buildTeamThreadLink(options: { guildId: string; threadId: string }) {
  return `discord://-/channels/${options.guildId}/${options.threadId}`
}

export async function createEventDiscussionThread(options: {
  eventName: string
  eventStartTime: Date
  eventUrl?: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
  existingThreadId?: string | null
}): Promise<string | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID

  if (!botToken || (!channelId && !forumId)) {
    console.warn(
      '⚠️ Discord event thread creation skipped: DISCORD_BOT_TOKEN and either DISCORD_NOTIFICATIONS_CHANNEL_ID or DISCORD_EVENTS_FORUM_ID must be configured'
    )
    return null
  }

  if (options.existingThreadId) {
    const exists = await doesDiscordThreadExist({
      threadId: options.existingThreadId,
      botToken,
    })
    if (exists) {
      return options.existingThreadId
    }
    console.warn(
      `⚠️ [Discord] Event thread ${options.existingThreadId} missing; creating a replacement`
    )
  }

  const threadParentId = forumId || channelId
  const cleanName = normalizeSeriesName(options.eventName)
  const dateLabel = new Intl.DateTimeFormat(appLocale, {
    month: 'numeric',
    day: 'numeric',
    timeZone: appTimeZone,
  }).format(options.eventStartTime)
  const threadName = `${cleanName} (${dateLabel})`

  const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${threadParentId}/threads`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: threadName,
      auto_archive_duration: 10080,
      message: {
        embeds: [
          {
            title: '🏁 Event Discussion',
            description: `General discussion thread for **${options.eventName}**. Use team threads for timeslot-specific planning.`,
            color: 0x5865f2,
            url: options.eventUrl,
            fields: [
              {
                name: '🏎️ Event',
                value: options.eventName,
                inline: true,
              },
              ...(options.track
                ? [
                    {
                      name: '🏟️ Track',
                      value: options.trackConfig
                        ? `${options.track} (${options.trackConfig})`
                        : options.track,
                      inline: true,
                    },
                  ]
                : []),
              ...(typeof options.tempValue === 'number'
                ? [
                    {
                      name: '🌤️ Weather',
                      value:
                        typeof options.precipChance === 'number'
                          ? `${options.tempValue}°F, ${options.precipChance}% Rain`
                          : `${options.tempValue}°F`,
                      inline: true,
                    },
                  ]
                : []),
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: appTitle,
            },
          },
        ],
      },
    }),
  })

  if (!threadResponse.ok) {
    const errorText = await threadResponse.text()
    let errorBody = {}
    try {
      errorBody = JSON.parse(errorText)
    } catch {
      errorBody = { raw: errorText }
    }
    console.error(
      `❌ [Discord] Failed to create event discussion thread: ${threadResponse.status} ${threadResponse.statusText}`,
      JSON.stringify(errorBody, null, 2)
    )
    return null
  }

  const thread = await threadResponse.json()
  const threadId = thread.id ?? null
  if (threadId) {
    console.log(`✅ [Discord] Created event discussion thread: ${threadId} in ${threadParentId}`)
  }
  return threadId
}

export async function createTeamThread(options: {
  teamName: string
  eventName: string
  raceStartTime: Date
  existingThreadId?: string | null
  memberDiscordIds?: string[]
  raceUrl?: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
  carClassName?: string
  members?: string[]
}): Promise<string | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID

  if (!botToken || (!channelId && !forumId)) {
    console.warn(
      '⚠️ Discord team thread creation skipped: DISCORD_BOT_TOKEN and either DISCORD_NOTIFICATIONS_CHANNEL_ID or DISCORD_EVENTS_FORUM_ID must be configured'
    )
    return null
  }

  const threadParentId = forumId || channelId

  if (options.existingThreadId) {
    const exists = await doesDiscordThreadExist({
      threadId: options.existingThreadId,
      botToken,
    })
    if (exists) {
      return options.existingThreadId
    }
    console.warn(
      `⚠️ [Discord] Team thread ${options.existingThreadId} missing; creating a replacement`
    )
  }

  const cleanName = normalizeSeriesName(options.eventName)
  const dateLabel = new Intl.DateTimeFormat(appLocale, {
    month: 'numeric',
    day: 'numeric',
    timeZone: appTimeZone,
  }).format(options.raceStartTime)
  const timeLabel = new Intl.DateTimeFormat(appLocale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: appTimeZone,
  }).format(options.raceStartTime)
  const threadName = `${options.teamName} • ${cleanName} (${dateLabel} - ${timeLabel})`

  const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${threadParentId}/threads`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: threadName,
      auto_archive_duration: 10080,
      message: {
        embeds: [
          {
            title: `🏎️ Team Thread: ${options.teamName}`,
            description: `Official preparation and coordination thread for **${options.teamName}** in **${options.eventName}**.`,
            color: 0x5865f2, // Blurple
            url: options.raceUrl,
            fields: [
              {
                name: '🏎️ Team',
                value: options.teamName,
                inline: true,
              },
              {
                name: '🏁 Class',
                value: options.carClassName || 'Unknown',
                inline: true,
              },
              {
                name: '🕐 Race Start',
                value: `<t:${Math.floor(options.raceStartTime.getTime() / 1000)}:F>`,
                inline: true,
              },
              ...(options.members?.length
                ? [
                    {
                      name: '👥 Members',
                      value: options.members.join('\n'),
                      inline: false,
                    },
                  ]
                : []),
              ...(options.track
                ? [
                    {
                      name: '🏟️ Track',
                      value: options.trackConfig
                        ? `${options.track} (${options.trackConfig})`
                        : options.track,
                      inline: true,
                    },
                  ]
                : []),
              ...(typeof options.tempValue === 'number'
                ? [
                    {
                      name: '🌤️ Weather',
                      value:
                        typeof options.precipChance === 'number'
                          ? `${options.tempValue}°F, ${options.precipChance}% Rain`
                          : `${options.tempValue}°F`,
                      inline: true,
                    },
                  ]
                : []),
            ],
            timestamp: new Date().toISOString(),
            footer: {
              text: appTitle,
            },
          },
        ],
      },
    }),
  })

  if (!threadResponse.ok) {
    const errorText = await threadResponse.text()
    let errorBody = {}
    try {
      errorBody = JSON.parse(errorText)
    } catch {
      errorBody = { raw: errorText }
    }
    console.error(
      `❌ [Discord] Failed to create team thread: ${threadResponse.status} ${threadResponse.statusText}`,
      JSON.stringify(errorBody, null, 2)
    )
    return null
  }

  const thread = await threadResponse.json()
  const threadId = thread.id ?? null
  if (threadId) {
    console.log(`✅ [Discord] Created team thread: ${threadId} in ${threadParentId}`)
  }
  if (threadId && options.memberDiscordIds?.length) {
    await addUsersToThread(threadId, options.memberDiscordIds)
  }
  return threadId
}
