import { existsSync } from 'node:fs'

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
    console.error('\n❌ Error: Missing configuration in .env')
    console.error('   Please ensure DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are set.')
    process.exit(1)
  }

  console.log(`\n🔍 Fetching roles for Guild ID: ${guildId}...`)

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Discord API Error: ${response.status} ${response.statusText}`)
      console.error(`   Message: ${errorText}`)
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

    console.log('\n' + '='.repeat(60))
    console.log(`${'ROLE ID'.padEnd(25)} | ROLE NAME`)
    console.log('-'.repeat(60))

    roles.forEach((role) => {
      console.log(`${role.id.padEnd(25)} | ${role.name}`)
    })

    console.log('='.repeat(60))
    console.log(`✅ Found ${roles.length} roles total.`)
    console.log('')
  } catch (error) {
    console.error('❌ Unexpected error fetching Discord roles:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
