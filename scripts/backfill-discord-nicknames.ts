import prisma from '../lib/prisma'
import { checkGuildMembership } from '../lib/discord'

async function main() {
  // Find all linked Discord accounts
  const accounts = await prisma.account.findMany({
    where: { provider: 'discord' },
    select: { providerAccountId: true, userId: true },
  })

  console.log(`Found ${accounts.length} discord-linked accounts`)

  for (const a of accounts) {
    const discordId = a.providerAccountId
    if (!discordId) {
      console.log(`Skipping account without providerAccountId for user ${a.userId}`)
      continue
    }
    try {
      const res = await checkGuildMembership(discordId)
      if (res?.nick) {
        // Update the corresponding user record
        await prisma.user.update({ where: { id: a.userId }, data: { name: res.nick } })
        console.log(`Updated user ${a.userId} -> ${res.nick}`)
      } else {
        console.log(`No nick for discordId ${discordId}`)
      }
    } catch (err) {
      console.error(`Failed for discordId ${discordId}:`, err)
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
    console.log('Backfill complete')
  })
  .catch(async (e) => {
    console.error('Backfill error', e)
    await prisma.$disconnect()
    process.exit(1)
  })
