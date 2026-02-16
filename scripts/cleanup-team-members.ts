import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function cleanupTeamMembers() {
  logger.info('Deleting all TeamMember records...')

  const result = await prisma.teamMember.deleteMany()
  logger.info('✓ Deleted %d TeamMember records', result.count)

  await prisma.$disconnect()
}

cleanupTeamMembers().catch((err) => logger.error({ err }, 'Failed to cleanup team members'))
