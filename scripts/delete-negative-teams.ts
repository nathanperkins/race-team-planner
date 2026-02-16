import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function main() {
  logger.info('Deleting teams with negative iRacing Team IDs...')

  const result = await prisma.team.deleteMany({
    where: {
      iracingTeamId: {
        lt: 0,
      },
    },
  })

  logger.info('Deleted %d teams with negative IDs', result.count)
}

main()
  .catch((e) => {
    logger.error({ err: e }, 'Failed to delete negative teams')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
