import { existsSync } from 'node:fs'
import { logger } from '../lib/logger'

/**
 * Script to fetch all roles from the configured Discord guild.
 * Uses DISCORD_BOT_TOKEN and DISCORD_GUILD_ID from .env.
 */
async function main() {
  // Load .env if it exists (Node.js 20.12.0+ / 21.7.0+)
  if (existsSync('.env')) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile()
      }
    } catch {
      // Fallback or ignore if not supported
    }
  }

  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID

  if (!botToken || !guildId) {
    logger.error('\n❌ Error: Missing configuration in .env')
    logger.error('   Please ensure DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are set.')
    process.exit(1)
  }

  logger.info(`\n🔍 Fetching roles for Guild ID: ${guildId}...`)

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`❌ Discord API Error: ${response.status} ${response.statusText}`)
      logger.error(`   Message: ${errorText}`)
      process.exit(1)
    }

    const roles = (await response.json()) as Array<{
      id: string
      name: string
      color: number
      hoist: boolean
      position: number
      permissions: string
      managed: boolean
      mentionable: boolean
    }>

    // Sort roles by position descending
    roles.sort((a, b) => b.position - a.position)

    logger.info('\n' + '='.repeat(60))
    logger.info(`${'ROLE ID'.padEnd(25)} | ROLE NAME`)
    logger.info('-'.repeat(60))

    roles.forEach((role) => {
      logger.info(`${role.id.padEnd(25)} | ${role.name}`)
    })

    logger.info('='.repeat(60))
    logger.info(`✅ Found ${roles.length} roles total.`)
    logger.info('')
  } catch (error) {
    logger.error({ err: error }, '❌ Unexpected error fetching Discord roles')
    process.exit(1)
  }
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error')
  process.exit(1)
})
