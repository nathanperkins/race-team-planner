import { features, appTitle } from '@/lib/config'

export async function register() {
  console.log(`🚧 ${appTitle} Startup 🚧`)

  console.log(`[Feature] Discord Auth: ${features.discordAuth ? 'Enabled ✅' : 'Disabled ❌'}`)
  console.log(
    `[Feature] Discord Membership Check: ${features.discordMembership ? 'Configured ✅' : 'NOT Configured ⚠️'}`
  )
  console.log(`[Feature] Mock Auth: ${features.mockAuth ? 'Enabled (Dev Mode) ✅' : 'Disabled ❌'}`)
  console.log(`[Feature] iRacing Sync: ${features.iracingSync ? 'Enabled ✅' : 'Disabled ❌'}`)
  if (features.feedback) {
    console.log(`[Notice] Feedback URL is CONFIGURED: ${process.env.NEXT_PUBLIC_FEEDBACK_URL} 📢`)
  } else {
    console.log('[Notice] Feedback URL is NOT configured (Optional) ⚠️')
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
      console.log(`[Discord] Bot Identity Verified: ${bot.name} (${bot.id}) ✅`)

      // 2. Verify Guild Access
      const guild = await verifyGuildAccess()
      if (guild) {
        console.log(
          `[Discord] Guild Access Verified: "${guild.name}" (${process.env.DISCORD_GUILD_ID}) ✅`
        )
      } else {
        console.error(
          `[Discord] Guild Access FAILED ❌ (Is the bot in Server ID: ${process.env.DISCORD_GUILD_ID}?)`
        )
      }

      // 3. Verify Admin Roles
      const adminRoles = await verifyAdminRoles()
      if (adminRoles.length > 0) {
        console.log(`[Discord] Admin Roles Verified: ${adminRoles.join(', ')} ✅`)
      } else if (process.env.DISCORD_ADMIN_ROLE_IDS) {
        console.error('[Discord] Admin Roles NOT FOUND ❌ (Check IDs in .env)')
      }

      // 4. Verify Notifications Channel
      const notificationsChannel = await verifyNotificationsChannel()
      if (notificationsChannel) {
        console.log(
          `[Discord] Notifications Channel Verified: #${notificationsChannel.name} (${process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID}) ✅`
        )
      } else if (process.env.DISCORD_NOTIFICATIONS_CHANNEL_ID) {
        console.error(
          '[Discord] Notifications Channel NOT FOUND ❌ (Check DISCORD_NOTIFICATIONS_CHANNEL_ID in .env)'
        )
      } else {
        console.log('[Discord] Notifications Channel: Not Configured (Optional) ⚠️')
      }

      // 5. Verify Events Forum
      const eventsForum = await verifyEventsForum()
      if (eventsForum) {
        console.log(
          `[Discord] Events Forum Verified: #${eventsForum.name} (${process.env.DISCORD_EVENTS_FORUM_ID}) ✅`
        )
      } else if (process.env.DISCORD_EVENTS_FORUM_ID) {
        console.error('[Discord] Events Forum NOT FOUND ❌ (Check DISCORD_EVENTS_FORUM_ID in .env)')
      } else {
        console.log('[Discord] Events Forum: Not Configured (Optional) ⚠️')
      }
    } else {
      console.error('[Discord] Bot Token is INVALID ❌ (Received 401/Unauthorized)')
    }
  }

  if (!features.discordAuth && !features.mockAuth) {
    console.error('❌ CRITICAL: No authentication providers enabled. Application will not start.')
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      process.exit(1)
    }
  }
}
