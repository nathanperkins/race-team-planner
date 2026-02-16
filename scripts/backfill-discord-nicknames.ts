import prisma from '../lib/prisma'
import { checkGuildMembership } from '../lib/discord'
import { logger } from '../lib/logger'

async function main() {
  // Find all linked Discord accounts
  const accounts = await prisma.account.findMany({
    where: { provider: 'discord' },
    select: { providerAccountId: true, userId: true },
  })

  logger.info(`Found ${accounts.length} discord-linked accounts`)

  for (const a of accounts) {
    const discordId = a.providerAccountId
    if (!discordId) {
      logger.info(`Skipping account without providerAccountId for user ${a.userId}`)
      continue
    }
    try {
      const res = await checkGuildMembership(discordId)
      if (res?.nick) {
        // Update the corresponding user record
        await prisma.user.update({ where: { id: a.userId }, data: { name: res.nick } })
        logger.info(`Updated user ${a.userId} -> ${res.nick}`)
      } else {
        logger.info(`No nick for discordId ${discordId}`)
      }
    } catch (err) {
      logger.error({ err, discordId }, 'Failed to backfill Discord nickname')
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
    logger.info('Backfill complete')
  })
  .catch(async (e) => {
    logger.error({ err: e }, 'Backfill error')
    await prisma.$disconnect()
    process.exit(1)
  })
