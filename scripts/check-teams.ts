import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function main() {
  const teams = await prisma.team.findMany()
  logger.info('Current teams in database:')
  teams.forEach((team) => {
    logger.info('  ID: %s', team.id)
    logger.info('  Name: %s', team.name)
    logger.info('  iRacing Team ID: %s', team.iracingTeamId)
    logger.info('  ---')
  })
}

main()
  .catch((e) => {
    logger.error({ err: e })
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
