import { features, appTitle, feedbackUrl, userGuideUrl, appLocale, appTimeZone } from '@/lib/config'
import { createLogger } from '@/lib/logger'

const logger = createLogger('instrumentation')

export async function register() {
  logger.info(`🚧 ${appTitle} Startup 🚧`)
  logger.info(`[Config] Log Level: ${logger.level}`)
  logger.info(`[Config] Locale: ${appLocale}`)
  logger.info(`[Config] Timezone: ${appTimeZone || 'Default (America/Los_Angeles)'}`)

  logger.info(`[Feature] Discord Auth: ${features.discordAuth ? 'Enabled ✅' : 'Disabled ❌'}`)
  logger.info(
    `[Feature] Discord Membership Check: ${features.discordMembership ? 'Configured ✅' : 'NOT Configured ⚠️'}`
  )
  logger.info(`[Feature] Mock Auth: ${features.mockAuth ? 'Enabled (Dev Mode) ✅' : 'Disabled ❌'}`)
  logger.info(`[Feature] iRacing Sync: ${features.iracingSync ? 'Enabled ✅' : 'Disabled ❌'}`)
  if (features.feedback) {
    logger.info(`[Notice] Feedback URL is CONFIGURED: ${feedbackUrl} 📢`)
  } else {
    logger.info('[Notice] Feedback URL is NOT configured (Optional) ⚠️')
  }
  if (features.userGuide) {
    logger.info(`[Notice] User Guide URL is CONFIGURED: ${userGuideUrl} 📢`)
  } else {
    logger.info('[Notice] User Guide URL is NOT configured (Optional) ⚠️')
  }

  if (features.discordMembership) {
    const {
      verifyBotToken,
      verifyGuildAccess,
      verifyAdminRoles,
      verifyNotificationsChannel,
      verifyEventsForum,
    } = await import('@/lib/discord')

    // 1. Verify Token
    const bot = await verifyBotToken()
    if (bot) {
      logger.info(`[Discord] Bot Identity Verified: ${bot.name} (${bot.id}) ✅`)

      // 2. Verify Guild Access
      const guild = await verifyGuildAccess()
      if (guild) {
        logger.info(
          `[Discord] Guild Access Verified: "${guild.name}" (${process.env.DISCORD_GUILD_ID}) ✅`
        )
      } else {
        logger.error(
          `[Discord] Guild Access FAILED ❌ (Is the bot in Server ID: ${process.env.DISCORD_GUILD_ID}?)`
        )
      }

      // 3. Verify Admin Roles
      const adminRoles = await verifyAdminRoles()
      if (adminRoles.length > 0) {
        logger.info(`[Discord] Admin Roles Verified: ${adminRoles.join(', ')} ✅`)
      } else if (process.env.DISCORD_ADMIN_ROLE_IDS) {
        logger.error('[Discord] Admin Roles NOT FOUND ❌ (Check IDs in .env)')
      }

      // 4. Verify Notifications Channel
      const notificationsChannel = await verifyNotificationsChannel()
      if (notificationsChannel) {
        logger.info(
          `[Discord] Notifications Channel Verified: #${notificationsChannel.name} (${process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID}) ✅`
        )
      } else if (process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID) {
        logger.error(
          '[Discord] Notifications Channel NOT FOUND ❌ (Check DISCORD_NOTIFICATIONS_CHANNEL_ID in .env)'
        )
      } else {
        logger.info('[Discord] Notifications Channel: Not Configured (Optional) ⚠️')
      }

      // 5. Verify Events Forum
      const eventsForum = await verifyEventsForum()
      if (eventsForum) {
        logger.info(
          `[Discord] Events Forum Verified: #${eventsForum.name} (${process.env.DISCORD_EVENTS_FORUM_ID}) ✅`
        )
      } else if (process.env.DISCORD_EVENTS_FORUM_ID) {
        logger.error('[Discord] Events Forum NOT FOUND ❌ (Check DISCORD_EVENTS_FORUM_ID in .env)')
      } else {
        logger.info('[Discord] Events Forum: Not Configured (Optional) ⚠️')
      }
    } else {
      logger.error('[Discord] Bot Token is INVALID ❌ (Received 401/Unauthorized)')
    }
  }

  if (!features.discordAuth && !features.mockAuth) {
    logger.error('❌ CRITICAL: No authentication providers enabled. Application will not start.')
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      process.exit(1)
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
  }
}
