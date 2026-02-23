import pRetry from 'p-retry'
import { appTitle, appLocale, appTimeZone } from './config'
import {
  OnboardingNotificationData,
  RegistrationNotificationData,
  WeeklyScheduleEvent,
  buildDiscordWebLink,
  buildEventThreadName,
  buildJoinEventButton,
  buildMainEventThreadButton,
  buildOnboardingEmbed,
  buildRegistrationEmbed,
  buildTeamsAssignedChatNotification,
  buildTeamsAssignedEmbeds,
  collectDiscordIds,
  formatISODate,
  normalizeSeriesName,
  parseDiscordErrorBody,
} from './discord-utils'
import { createLogger } from './logger'

const logger = createLogger('discord')

const DISCORD_API_BASE = 'https://discord.com/api/v10'

const DISCORD_RETRY_CONFIG = { retries: 3, minTimeout: 100, maxTimeout: 2000, factor: 2 }

/** Auto-archive duration for Discord threads in minutes (1 day = 1440). */
const THREAD_AUTO_ARCHIVE_DURATION = 1440

async function getDiscordThreadParentInfo(options: { threadId: string; botToken: string }) {
  return pRetry(async () => {
    const response = await fetch(`${DISCORD_API_BASE}/channels/${options.threadId}`, {
      headers: {
        Authorization: `Bot ${options.botToken}`,
      },
    })

    if (response.status === 404) {
      return { exists: false as const, parentId: null as string | null }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Unable to verify thread parent ${options.threadId}: ${response.status} ${response.statusText} - ${errorText}`
      )
    }

    const body = (await response.json()) as { parent_id?: string | null }
    return { exists: true as const, parentId: body.parent_id ?? null }
  }, DISCORD_RETRY_CONFIG)
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
    logger.warn(
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
      logger.error(
        `Discord API error checking membership for ${userId}: ${response.status} ${response.statusText}`
      )
      return { status: GuildMembershipStatus.API_ERROR }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to check Discord guild membership')
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
      logger.error(
        { status: response.status, statusText: response.statusText, text },
        '❌ Discord Token Verification Failed'
      )
      return null
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Discord API during verification')
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
      logger.error(
        { status: response.status, statusText: response.statusText, text },
        '❌ Discord Guild Access Failed'
      )
      return null
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Discord API during guild verification')
    return null
  }
}

interface DiscordRole {
  id: string
  name: string
}

/**
 * Find the first message in a thread authored by the bot.
 * Returns the message ID if found, or null if not found.
 */
export async function findBotMessageInThread(
  threadId: string,
  botToken: string
): Promise<string | null> {
  return pRetry(async () => {
    // Get bot's own user ID
    const botInfo = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (!botInfo.ok) {
      const errorText = await botInfo.text()
      throw new Error(
        `Failed to get bot user ID: ${botInfo.status} ${botInfo.statusText} - ${errorText}`
      )
    }

    const botUserId = (await botInfo.json()).id
    if (!botUserId) {
      throw new Error('Bot user ID is missing from API response')
    }

    // Fetch recent messages from the thread
    const messagesResponse = await fetch(
      `${DISCORD_API_BASE}/channels/${threadId}/messages?limit=25`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text()
      throw new Error(
        `Failed to fetch messages from thread ${threadId}: ${messagesResponse.status} ${messagesResponse.statusText} - ${errorText}`
      )
    }

    const messages = await messagesResponse.json()

    // Find the first message authored by this bot (usually the thread starter)
    const existingMessage = Array.isArray(messages)
      ? messages
          .reverse() // Reverse to get oldest first
          .find(
            (message: { author?: { id?: string } }) =>
              botUserId && message?.author?.id === botUserId
          )
      : null

    return existingMessage?.id ?? null
  }, DISCORD_RETRY_CONFIG)
}

/**
 * Upserts a message in a Discord thread.
 * If the bot has an existing message in the thread, it will be edited.
 * Otherwise, a new message will be posted.
 *
 * @param threadId - The Discord thread/channel ID
 * @param payload - The message payload (content, embeds, etc.)
 * @param botToken - The Discord bot token
 * @returns The Discord API Response
 */
export async function upsertThreadMessage(
  threadId: string,
  payload: {
    content?: string
    embeds?: unknown[]
    allowed_mentions?: { users?: string[]; parse?: string[] }
  },
  botToken: string
): Promise<Response> {
  // TODO: Store the main thread message ID in the database to avoid searching for it
  // This would require adding a discordMainMessageId field to the Race model
  const existingMessageId = await findBotMessageInThread(threadId, botToken)

  if (existingMessageId) {
    // Try to edit existing message, with retry for network errors and transient HTTP errors
    try {
      const editResponse = await pRetry(async () => {
        const response = await fetch(
          `${DISCORD_API_BASE}/channels/${threadId}/messages/${existingMessageId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        )
        // Don't retry 404 - message was deleted, fall through to create new one
        if (response.status === 404) {
          return response
        }
        // Retry other HTTP errors (500, 503, etc.)
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Failed to edit message ${existingMessageId}: ${response.status} ${response.statusText} - ${errorText}`
          )
        }
        return response
      }, DISCORD_RETRY_CONFIG)

      if (editResponse.ok) {
        logger.info(`✏️ Updated existing message in thread ${threadId}`)
        return editResponse
      }
      if (editResponse.status === 404) {
        logger.info({ existingMessageId }, 'Message not found, will create new message')
        // Fall through to create new message
      }
    } catch (error) {
      // Edit failed after retries - log and fall through to create new message
      logger.warn(
        { err: error, existingMessageId, threadId },
        'Failed to edit existing message after retries'
      )
      // Fall through to create new message
    }
  }

  // Post new message if no existing message or edit failed
  // pRetry will only retry network errors (fetch throws) not HTTP errors (response.ok = false)
  const resp = await pRetry(async () => {
    return await fetch(`${DISCORD_API_BASE}/channels/${threadId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }, DISCORD_RETRY_CONFIG)

  if (resp.ok) {
    logger.info(`✅ Created new message in thread ${threadId}`)
  } else {
    logger.warn(
      `❌ Failed to create message in thread ${threadId}: ${resp.status} ${resp.statusText}`
    )
  }
  return resp
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
      logger.error(`❌ Discord Admin Role Verification Failed: ${response.status}`)
      return []
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Discord API during role verification')
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
      logger.error(
        { status: response.status, statusText: response.statusText, text },
        '❌ Discord Notifications Channel Access Failed'
      )
      return null
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Discord API during channel verification')
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
      logger.error(
        { status: response.status, statusText: response.statusText, text },
        '❌ Discord Events Forum Access Failed'
      )
      return null
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Failed to connect to Discord API during forum verification')
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
    logger.warn(
      'Discord registration notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  try {
    const notificationEmbed = buildRegistrationEmbed(data, appTitle, {
      includeRegisteredDrivers: true,
      includeDiscussionLink: false,
    })
    const threadEmbed = buildRegistrationEmbed(data, appTitle, {
      includeDiscussionLink: false,
    })

    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        embeds: [notificationEmbed],
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Join Event',
                url: data.eventUrl,
              },
              {
                type: 2,
                style: 5,
                label: 'View Thread',
                url: buildDiscordWebLink({ guildId: data.guildId, threadId: data.threadId }),
              },
            ],
          },
        ],
        flags: 4096, // Suppress notifications (silent)
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        'Failed to send Discord registration notification: %d %s: %s',
        response.status,
        response.statusText,
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
          embeds: [threadEmbed],
          flags: 4096, // Suppress notifications (silent)
        }),
      })

      if (!threadResponse.ok) {
        const threadErrorText = await threadResponse.text()
        logger.error(
          'Failed to send Discord registration notification to thread %s: %d %s: %s',
          data.threadId,
          threadResponse.status,
          threadResponse.statusText,
          threadErrorText
        )
      }
    }

    logger.info(
      { userName: data.userName, eventName: data.eventName },
      'Registration notification sent'
    )
    return true
  } catch (error) {
    logger.error({ err: error }, 'Error sending Discord registration notification')
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
    logger.warn(
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
      logger.error(
        { status: response.status, statusText: response.statusText, errorText },
        'Failed to send Discord onboarding notification'
      )
      return false
    }

    logger.info({ userName: data.userName }, '✅ Onboarding notification sent')
    return true
  } catch (error) {
    logger.error({ err: error }, 'Error sending Discord onboarding notification')
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
    logger.warn(
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

    let allSucceeded = true
    for (const chunk of chunks) {
      const chunkIndex = chunks.indexOf(chunk) + 1
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
        logger.info({ chunkIndex, totalChunks: chunks.length }, '✅ Weekly schedule chunk sent')
      } else {
        const errorText = await resp.text()
        logger.error(
          {
            chunkIndex,
            totalChunks: chunks.length,
            status: resp.status,
            statusText: resp.statusText,
            errorText,
          },
          '❌ Failed to send weekly schedule chunk'
        )
        allSucceeded = false
      }
    }

    return allSucceeded
  } catch (error) {
    logger.error({ err: error }, 'Error sending Discord weekly schedule notification')
    return false
  }
}

/**
 * Posts roster change notifications as separate messages in the thread.
 * These are smaller, specific notifications like "Added X to Team Y" or "X Dropped".
 * Posts to both the event thread and affected team threads.
 */
export async function postRosterChangeNotifications(
  eventThreadId: string,
  rosterChanges: import('./discord-utils').RosterChange[],
  botToken: string,
  adminName: string,
  teamThreads?: Record<string, string>,
  teamNameById?: Map<string, string>,
  suppressTeamThreadIds?: string[],
  teamMentionDiscordIdsByTeamId?: Record<string, string[]>
): Promise<void> {
  if (rosterChanges.length === 0) return

  const { buildRosterChangesEmbed } = await import('./discord-utils')

  // Helper to post an embed to a thread
  const postEmbedToThread = async (
    threadId: string,
    embed: Record<string, unknown>,
    label: string,
    mentionDiscordIds?: string[]
  ) => {
    try {
      const users = Array.from(new Set(mentionDiscordIds ?? [])).filter(Boolean)
      const response = await fetch(`${DISCORD_API_BASE}/channels/${threadId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: users.length > 0 ? users.map((id) => `<@${id}>`).join(' ') : undefined,
          allowed_mentions: users.length > 0 ? { users, parse: [] as string[] } : undefined,
          embeds: [embed],
          flags: 4096, // Suppress notifications (silent)
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(
          'Failed to post roster changes to %s: %d %s: %s',
          label,
          response.status,
          response.statusText,
          errorText
        )
      } else {
        logger.info('✅ Posted roster changes to %s', label)
      }
    } catch (error) {
      logger.error({ err: error, label }, 'Error posting roster changes')
    }
  }

  // Post all changes to the event thread as a fancy embed
  const embed = buildRosterChangesEmbed(rosterChanges, appTitle, adminName)
  const discordWork = [postEmbedToThread(eventThreadId, embed, 'event thread')]

  // Post relevant changes to team threads
  if (teamThreads && teamNameById) {
    const suppressedTeamThreadIdSet = new Set(suppressTeamThreadIds ?? [])
    // Build reverse map: team name -> team ID
    const teamIdByName = new Map<string, string>()
    for (const [id, name] of teamNameById.entries()) {
      teamIdByName.set(name, id)
    }

    // Group changes by affected teams
    const changesByTeam = new Map<string, import('./discord-utils').RosterChange[]>()

    for (const change of rosterChanges) {
      const affectedTeams: string[] = []

      switch (change.type) {
        case 'added':
          affectedTeams.push(change.teamName)
          break
        case 'moved':
          affectedTeams.push(change.fromTeam, change.toTeam)
          break
        case 'unassigned':
          affectedTeams.push(change.fromTeam)
          break
        case 'teamClassChanged':
          affectedTeams.push(change.teamName)
          break
        case 'dropped':
          // Dropped drivers should notify the originating team thread when available.
          if (change.fromTeam && change.fromTeam !== 'Unassigned') {
            affectedTeams.push(change.fromTeam)
          }
          break
      }

      for (const teamName of affectedTeams) {
        const teamId = teamIdByName.get(teamName)
        if (teamId && teamThreads[teamId]) {
          const existing = changesByTeam.get(teamId) || []
          existing.push(change)
          changesByTeam.set(teamId, existing)
        }
      }
    }

    discordWork.push(
      ...Array.from(changesByTeam.entries()).map(async ([teamId, changes]) => {
        const teamName = teamNameById.get(teamId) || 'Team'
        const threadId = teamThreads[teamId]
        if (threadId && suppressedTeamThreadIdSet.has(threadId)) {
          return
        }
        if (changes.length > 0 && threadId) {
          const teamEmbed = buildRosterChangesEmbed(changes, appTitle, adminName)
          await postEmbedToThread(
            threadId,
            teamEmbed,
            `${teamName} thread`,
            teamMentionDiscordIdsByTeamId?.[teamId]
          )
        }
      })
    )
  }

  await Promise.all(discordWork)
}

/**
 * Sends a chat channel notification when teams are assigned.
 * Requires an existing thread - use createOrUpdateEventThread() to create the thread first.
 *
 * @param threadId - The existing thread ID (required)
 * @param data - Notification data including event name, timeslots, etc.
 * @param options - Optional title override and roster changes
 * @returns True if notification sent successfully
 */
export async function sendTeamsAssignedNotification(
  threadId: string,
  data: {
    eventName: string
    timeslots: import('./discord-utils').RaceTimeslotData[]
    eventUrl: string
    rosterChanges?: import('./discord-utils').RosterChange[]
    adminName?: string
    teamThreads?: Record<string, string>
    teamNameById?: Map<string, string>
    suppressTeamThreadIds?: string[]
    teamMentionDiscordIdsByTeamId?: Record<string, string[]>
  },
  options?: {
    title?: string
  }
): Promise<boolean> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID
  const guildId = process.env.DISCORD_GUILD_ID

  if (!botToken || !channelId) {
    logger.warn(
      '⚠️ Discord teams notification skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return false
  }

  try {
    let success = true

    // Send chat channel notification (only for forum-based setups)
    if (forumId && guildId) {
      const threadUrl = buildDiscordWebLink({ guildId, threadId })
      const chatNotification = buildTeamsAssignedChatNotification(
        data.eventName,
        data.timeslots,
        data.eventUrl,
        threadUrl,
        options?.title ?? '🏁 Teams Assigned',
        appTitle,
        data.adminName
      )

      const chatResp = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatNotification),
      })

      if (chatResp.ok) {
        logger.info(`✅ Posted teams assigned notification to chat channel ${channelId}`)
      } else {
        const errorText = await chatResp.text()
        logger.error(
          '❌ Failed to post teams notification to chat channel %s: %d %s: %s',
          channelId,
          chatResp.status,
          chatResp.statusText,
          errorText
        )
        success = false
        // Don't return early — roster change notifications to threads must still be sent
      }
    }

    // Post roster change notifications if provided
    if (data.rosterChanges && data.rosterChanges.length > 0 && data.adminName) {
      await postRosterChangeNotifications(
        threadId,
        data.rosterChanges,
        botToken,
        data.adminName,
        data.teamThreads,
        data.teamNameById,
        data.suppressTeamThreadIds,
        data.teamMentionDiscordIdsByTeamId
      )
    }

    return success
  } catch (error) {
    logger.error({ err: error }, 'Error sending teams assigned notification')
    return false
  }
}

export async function addUsersToThread(threadId: string, discordUserIds: string[]) {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    return
  }

  const uniqueIds = Array.from(new Set(discordUserIds)).filter(Boolean)

  // Add all users concurrently for better performance
  await Promise.all(
    uniqueIds.map(async (userId) => {
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
          logger.error(
            {
              userId,
              threadId,
              status: response.status,
              statusText: response.statusText,
              errorText,
            },
            'Failed to add user to thread'
          )
        }
      } catch (error) {
        logger.error({ err: error, userId, threadId }, 'Failed to add user to thread')
      }
    })
  )
}

export {
  buildDiscordAppLink,
  buildDiscordWebLink,
  buildJoinEventButton,
  buildMainEventThreadButton,
  parseDiscordErrorBody,
} from './discord-utils'

/**
 * Creates or updates an event thread with team composition data.
 * This is the unified thread management function that handles both initial creation
 * and subsequent updates as teams are assigned.
 *
 * @returns Object with ok status and threadId if successful
 */
export async function createOrUpdateEventThread(data: {
  eventName: string
  raceUrl: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
  carClasses: string[]
  timeslots: import('./discord-utils').RaceTimeslotData[]
  threadId?: string | null
  mentionRegistrationIds?: string[]
}): Promise<{ ok: boolean; threadId?: string }> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID

  if (!botToken || !channelId) {
    logger.warn(
      '⚠️ Discord event thread creation skipped: DISCORD_BOT_TOKEN or DISCORD_NOTIFICATIONS_CHANNEL_ID not configured'
    )
    return { ok: false }
  }

  const threadParentId = forumId || channelId

  try {
    const threadName = buildEventThreadName(
      data.eventName,
      data.timeslots[0]?.raceStartTime ?? new Date(),
      { locale: appLocale, timeZone: appTimeZone }
    )
    const allDiscordIds = collectDiscordIds(data.timeslots)
    const embeds = buildTeamsAssignedEmbeds(data, appTitle, {
      locale: appLocale,
      timeZone: appTimeZone,
    })

    let threadId = data.threadId ?? null
    if (threadId) {
      const threadInfo = await getDiscordThreadParentInfo({ threadId, botToken })
      if (!threadInfo.exists) {
        logger.warn(`⚠️ Event thread ${threadId} missing; creating a new one`)
        threadId = null
      } else if (forumId && threadInfo.parentId !== forumId) {
        logger.warn(
          `⚠️ Event thread ${threadId} is not in forum ${forumId}; creating a replacement in forum`
        )
        threadId = null
      }
    }

    const upsertThreadMessageWithMentions = async (
      id: string,
      embeds: ReturnType<typeof buildTeamsAssignedEmbeds>,
      mentionSet: Set<string>
    ) => {
      const mentionList = Array.from(mentionSet)
        .map((regId) => allDiscordIds.get(regId))
        .filter((did): did is string => Boolean(did))
        .map((did) => `<@${did}>`)
      const allowedIds = Array.from(mentionSet)
        .map((regId) => allDiscordIds.get(regId))
        .filter((did): did is string => Boolean(did))
      const content = mentionList.length ? mentionList.join(' ') : undefined
      const payload = {
        content,
        embeds,
        allowed_mentions: { users: allowedIds, parse: [] as string[] },
        components: [{ type: 1, components: [buildJoinEventButton(data.raceUrl)] }],
      }

      return upsertThreadMessage(id, payload, botToken)
    }

    /** Creates a new thread and returns its ID, or null on failure. */
    const createNewThread = async (): Promise<string | null> => {
      const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${threadParentId}/threads`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: threadName,
          auto_archive_duration: THREAD_AUTO_ARCHIVE_DURATION,
          message: {
            content: undefined,
            embeds,
            allowed_mentions: { users: [], parse: [] },
            components: [{ type: 1, components: [buildJoinEventButton(data.raceUrl)] }],
          },
        }),
      })

      if (!threadResponse.ok) {
        const errorBody = await parseDiscordErrorBody(threadResponse)
        logger.error(
          '❌ Failed to create event thread in %s: %d %s: %o',
          threadParentId,
          threadResponse.status,
          threadResponse.statusText,
          errorBody
        )
        return null
      }

      const thread = await threadResponse.json()
      const newId = (thread.id as string) ?? null
      if (newId) {
        logger.info(`✅ Created event thread: ${newId} in ${threadParentId}`)
        const allMemberDiscordIds = Array.from(allDiscordIds.values())
        if (allMemberDiscordIds.length > 0) {
          await addUsersToThread(newId, allMemberDiscordIds)
        }
      }
      return newId
    }

    if (!threadId) {
      // Create new thread
      threadId = await createNewThread()
      if (!threadId) return { ok: false }
      return { ok: true, threadId }
    }

    // Update existing thread
    const mentionSet = new Set(data.mentionRegistrationIds ?? [])
    const allMemberDiscordIds = Array.from(allDiscordIds.values())
    const postResponse = await upsertThreadMessageWithMentions(threadId, embeds, mentionSet)

    if (!postResponse.ok && postResponse.status === 404) {
      // Thread deleted or inaccessible; create a new one.
      const newThreadId = await createNewThread()
      if (!newThreadId) return { ok: false }
      return { ok: true, threadId: newThreadId }
    } else if (!postResponse.ok) {
      const errorText = await postResponse.text()
      logger.error(
        'Failed to update event thread: %d %s: %s',
        postResponse.status,
        postResponse.statusText,
        errorText
      )
      return { ok: false, threadId: threadId ?? undefined }
    }

    // Add all current members to the thread (ensures new drivers are added)
    if (allMemberDiscordIds.length > 0) {
      await addUsersToThread(threadId, allMemberDiscordIds)
    }

    return { ok: true, threadId: threadId ?? undefined }
  } catch (error) {
    logger.error({ err: error }, 'Error creating or updating event thread')
    return { ok: false }
  }
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
    logger.warn(
      '⚠️ Discord event thread creation skipped: DISCORD_BOT_TOKEN and either DISCORD_NOTIFICATIONS_CHANNEL_ID or DISCORD_EVENTS_FORUM_ID must be configured'
    )
    return null
  }

  if (options.existingThreadId) {
    const { exists } = await getDiscordThreadParentInfo({
      threadId: options.existingThreadId,
      botToken,
    })
    if (exists) {
      return options.existingThreadId
    }
    logger.warn(`⚠️ Event thread ${options.existingThreadId} missing; creating a replacement`)
  }

  const threadParentId = forumId || channelId
  const threadName = buildEventThreadName(options.eventName, options.eventStartTime, {
    locale: appLocale,
    timeZone: appTimeZone,
  })

  const threadResponse = await fetch(`${DISCORD_API_BASE}/channels/${threadParentId}/threads`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: threadName,
      auto_archive_duration: THREAD_AUTO_ARCHIVE_DURATION,
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
    const errorBody = await parseDiscordErrorBody(threadResponse)
    logger.error(
      '❌ Failed to create event discussion thread: %d %s: %o',
      threadResponse.status,
      threadResponse.statusText,
      errorBody
    )
    return null
  }

  const thread = await threadResponse.json()
  const threadId = thread.id ?? null
  if (threadId) {
    logger.info(`✅ Created event discussion thread: ${threadId} in ${threadParentId}`)
  }
  return threadId
}

export async function createOrUpdateTeamThread(options: {
  teamName: string
  eventName: string
  raceStartTime: Date
  existingThreadId?: string | null
  mainEventThreadUrl?: string
  memberDiscordIds?: string[]
  raceUrl?: string
  track?: string
  trackConfig?: string
  tempValue?: number | null
  precipChance?: number | null
  carClassName?: string
  members?: string[]
  actorName?: string
}): Promise<string | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID
  const forumId = process.env.DISCORD_EVENTS_FORUM_ID

  if (!botToken || (!channelId && !forumId)) {
    logger.warn(
      '⚠️ Discord team thread creation skipped: DISCORD_BOT_TOKEN and either DISCORD_NOTIFICATIONS_CHANNEL_ID or DISCORD_EVENTS_FORUM_ID must be configured'
    )
    return null
  }

  const threadParentId = forumId || channelId
  let createdByName = options.actorName
  const editedByName = options.actorName

  const extractCreatedByFromExistingTeamThread = async (
    threadId: string
  ): Promise<string | null> => {
    try {
      const botInfo = await fetch(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      })
      if (!botInfo.ok) return null
      const botUserId = (await botInfo.json()).id as string | undefined
      if (!botUserId) return null

      const messagesResponse = await fetch(
        `${DISCORD_API_BASE}/channels/${threadId}/messages?limit=25`,
        {
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!messagesResponse.ok) return null

      const messages = (await messagesResponse.json()) as Array<{
        author?: { id?: string }
        embeds?: Array<{ fields?: Array<{ name?: string; value?: string }> }>
      }>
      const existingMessage = messages
        .slice()
        .reverse()
        .find((message) => message?.author?.id === botUserId)
      const fields = existingMessage?.embeds?.[0]?.fields ?? []
      const createdByField = fields.find((field) => field.name === 'Created By')
      return createdByField?.value ?? null
    } catch {
      return null
    }
  }

  // Build the team thread embed
  const buildTeamEmbed = () => ({
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
      ...(createdByName
        ? [
            {
              name: 'Created By',
              value: createdByName,
              inline: true,
            },
          ]
        : []),
      ...(editedByName
        ? [
            {
              name: 'Edited By',
              value: editedByName,
              inline: true,
            },
          ]
        : []),
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: appTitle,
    },
  })
  // If thread exists, upsert the message to keep it current
  if (options.existingThreadId) {
    const existingInfo = await getDiscordThreadParentInfo({
      threadId: options.existingThreadId,
      botToken,
    })

    if (!existingInfo.exists) {
      logger.warn(`⚠️ Team thread ${options.existingThreadId} missing; creating a replacement`)
    } else if (forumId && existingInfo.parentId !== forumId) {
      logger.warn(
        `⚠️ Team thread ${options.existingThreadId} is not in forum ${forumId}; creating a replacement in forum`
      )
    } else {
      try {
        const existingCreatedBy = await extractCreatedByFromExistingTeamThread(
          options.existingThreadId
        )
        if (existingCreatedBy) {
          createdByName = existingCreatedBy
        }
        const upsertResponse = await upsertThreadMessage(
          options.existingThreadId,
          {
            embeds: [buildTeamEmbed()],
            ...(options.mainEventThreadUrl
              ? {
                  components: [
                    {
                      type: 1,
                      components: [buildMainEventThreadButton(options.mainEventThreadUrl)],
                    },
                  ],
                }
              : {}),
          },
          botToken
        )

        // If upsert succeeded, the thread exists and was updated
        if (upsertResponse.ok) {
          logger.info(`✅ Reused existing team thread: ${options.existingThreadId}`)

          // Add all current members to the thread (ensures new drivers are added)
          if (options.memberDiscordIds?.length) {
            await addUsersToThread(options.existingThreadId, options.memberDiscordIds)
          }

          return options.existingThreadId
        }

        // If 404, thread was deleted - fall through to create a new one
        if (upsertResponse.status === 404) {
          logger.warn(`⚠️ Team thread ${options.existingThreadId} missing; creating a replacement`)
        } else {
          // Other error - log it but continue to create new thread
          const errorText = await upsertResponse.text()
          logger.warn(
            '⚠️ Failed to update team thread %s: %d %s: %s',
            options.existingThreadId,
            upsertResponse.status,
            upsertResponse.statusText,
            errorText
          )
        }
      } catch (error) {
        logger.warn(
          { err: error },
          '⚠️ Failed to update team thread %s; creating a replacement',
          options.existingThreadId
        )
      }
    }
  }

  const cleanName = normalizeSeriesName(options.eventName)
  const dateLabel = formatISODate(options.raceStartTime, {
    locale: appLocale,
    timeZone: appTimeZone,
  })
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
      auto_archive_duration: THREAD_AUTO_ARCHIVE_DURATION,
      message: {
        embeds: [buildTeamEmbed()],
        ...(options.mainEventThreadUrl
          ? {
              components: [
                {
                  type: 1,
                  components: [buildMainEventThreadButton(options.mainEventThreadUrl)],
                },
              ],
            }
          : {}),
      },
    }),
  })

  if (!threadResponse.ok) {
    const errorBody = await parseDiscordErrorBody(threadResponse)
    logger.error(
      '❌ Failed to create team thread: %d %s: %o',
      threadResponse.status,
      threadResponse.statusText,
      errorBody
    )
    return null
  }

  const thread = await threadResponse.json()
  const threadId = thread.id ?? null
  if (threadId) {
    logger.info(`✅ Created team thread: ${threadId} in ${threadParentId}`)
  }
  if (threadId && options.memberDiscordIds?.length) {
    await addUsersToThread(threadId, options.memberDiscordIds)
  }
  return threadId
}

/**
 * Refreshes all team thread discussion posts for the given races.
 * This updates the team rosters shown in each team's discussion post.
 */
export async function refreshAllTeamThreads(
  races: Array<{
    id: string
    startTime: Date
    event: {
      id: string
      name: string
      track: string | null
      trackConfig: string | null
      tempValue: number | null
      precipChance: number | null
    }
    teams: Array<{
      id: string
      name: string
      alias: string | null
      carClass: { name: string } | null
      registrations: Array<{
        id: string
        user: {
          name: string | null
          image: string | null
          accounts: Array<{ provider: string; providerAccountId: string }>
        } | null
        manualDriver: { name: string } | null
      }>
    }>
  }>,
  teamThreads: Record<string, string>,
  botToken: string,
  baseUrl: string
): Promise<void> {
  // Build a map of team ID to team data across all races
  const teamsById = new Map<string, (typeof races)[0]['teams'][0] & { raceStartTime: Date }>()
  for (const race of races) {
    for (const team of race.teams) {
      teamsById.set(team.id, { ...team, raceStartTime: race.startTime })
    }
  }

  // Update each team thread in parallel
  const teamThreadUpdates = Object.entries(teamThreads).map(async ([teamId, threadId]) => {
    const team = teamsById.get(teamId)
    if (!team || !races[0]?.event) return

    const event = races[0].event
    const memberNames = team.registrations.map(
      (reg) => reg.user?.name || reg.manualDriver?.name || 'Unknown'
    )
    const memberDiscordIds = team.registrations
      .map((reg) => reg.user?.accounts.find((acc) => acc.provider === 'discord')?.providerAccountId)
      .filter((id): id is string => Boolean(id))

    try {
      await createOrUpdateTeamThread({
        teamName: team.alias || team.name,
        eventName: event.name,
        raceStartTime: team.raceStartTime,
        existingThreadId: threadId,
        raceUrl: `${baseUrl}/events?eventId=${event.id}`,
        track: event.track ?? undefined,
        trackConfig: event.trackConfig ?? undefined,
        tempValue: event.tempValue,
        precipChance: event.precipChance,
        carClassName: team.carClass?.name,
        members: memberNames,
        memberDiscordIds,
      })
    } catch (error) {
      logger.error({ err: error, teamId, threadId }, 'Failed to refresh team thread')
      // Continue with other threads even if one fails
    }
  })

  // Execute all updates in parallel with error handling
  await Promise.all(teamThreadUpdates)
}
