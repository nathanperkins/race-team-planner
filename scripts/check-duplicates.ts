import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function checkDuplicates() {
  // Check TeamMember duplicates
  const members = await prisma.$queryRaw<Array<{ custId: number; count: bigint }>>`
    SELECT "custId", COUNT(*) as count
    FROM "TeamMember"
    GROUP BY "custId"
    HAVING COUNT(*) > 1
  `

  logger.info('\n=== TeamMember Duplicates ===')
  logger.info(`Found ${members.length} custIds with duplicates:`)
  for (const m of members) {
    logger.info(`  custId ${m.custId}: ${m.count} records`)
  }

  // Check total TeamMembers
  const totalMembers = await prisma.teamMember.count()
  logger.info(`\nTotal TeamMember records: ${totalMembers}`)

  // Check if there's data in the junction table
  const junctionData = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "_TeamToTeamMember"
  `
  logger.info(`\nJunction table (_TeamToTeamMember) records: ${junctionData[0].count}`)

  // Check User iracingCustomerId duplicates
  const userDups = await prisma.$queryRaw<Array<{ iracingCustomerId: number; count: bigint }>>`
    SELECT "iracingCustomerId", COUNT(*) as count
    FROM "User"
    WHERE "iracingCustomerId" IS NOT NULL
    GROUP BY "iracingCustomerId"
    HAVING COUNT(*) > 1
  `

  logger.info('\n=== User iracingCustomerId Duplicates ===')
  if (userDups.length > 0) {
    logger.info(`Found ${userDups.length} iracingCustomerIds with duplicates:`)
    for (const u of userDups) {
      logger.info(`  iracingCustomerId ${u.iracingCustomerId}: ${u.count} records`)
    }
  } else {
    logger.info('No duplicates found!')
  }

  await prisma.$disconnect()
}

checkDuplicates().catch((err) => logger.error({ err }, 'Failed to check duplicates'))
