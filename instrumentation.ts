import { features } from '@/lib/config'

export async function register() {
  console.log('🚧 iRacing Team Planner Startup 🚧')

  console.log(`[Feature] Discord Auth: ${features.discordAuth ? 'Enabled ✅' : 'Disabled ❌'}`)
  console.log(`[Feature] Discord Membership Check: ${features.discordMembership ? 'Configured ✅' : 'NOT Configured ⚠️'}`)
  console.log(`[Feature] Mock Auth: ${features.mockAuth ? 'Enabled (Dev Mode) ✅' : 'Disabled ❌'}`)
  console.log(`[Feature] iRacing Sync: ${features.iracingSync ? 'Enabled ✅' : 'Disabled ❌'}`)

  if (features.discordMembership) {
    const { verifyBotToken, verifyGuildAccess } = await import('@/lib/discord')

    // 1. Verify Token
    const bot = await verifyBotToken()
    if (bot) {
      console.log(`[Discord] Bot Identity Verified: ${bot.name} (${bot.id}) ✅`)

      // 2. Verify Guild Access
      const guild = await verifyGuildAccess()
      if (guild) {
        console.log(`[Discord] Guild Access Verified: "${guild.name}" (${process.env.DISCORD_GUILD_ID}) ✅`)
      } else {
        console.error(`[Discord] Guild Access FAILED ❌ (Is the bot in Server ID: ${process.env.DISCORD_GUILD_ID}?)`)
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
