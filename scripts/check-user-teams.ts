import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function main() {
  // Find user by email
  const user = await prisma.user.findFirst({
    where: {
      email: 'xsteveo243x@gmail.com',
    },
    include: {
      teams: true,
    },
  })

  if (!user) {
    logger.info('User not found')
    return
  }

  logger.info('User Details:')
  logger.info('  Name: %s', user.name)
  logger.info('  Email: %s', user.email)
  logger.info('  iRacing Customer ID: %s', user.iracingCustomerId)
  logger.info('  Teams: %d', user.teams.length)

  if (user.teams.length > 0) {
    logger.info('\nTeams:')
    user.teams.forEach((team) => {
      logger.info(`  - ${team.name} (iRacing ID: ${team.iracingTeamId})`)
    })
  } else {
    logger.info('\n❌ No teams linked to this user')
  }

  // Check all teams
  logger.info('\n--- All Teams in Database ---')
  const allTeams = await prisma.team.findMany({
    include: {
      members: {
        select: {
          id: true,
          name: true,
          email: true,
          iracingCustomerId: true,
        },
      },
    },
  })

  allTeams.forEach((team) => {
    logger.info(`\nTeam: ${team.name} (iRacing ID: ${team.iracingTeamId})`)
    logger.info(`  Members in DB: ${team.members.length}`)
    team.members.forEach((member) => {
      logger.info(
        `    - ${member.name} (${member.email}) - iRacing ID: ${member.iracingCustomerId}`
      )
    })
  })
}

main()
  .catch((e) => {
    logger.error({ err: e }, 'Failed to check user teams')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
