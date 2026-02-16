import prisma from '../lib/prisma'
import { logger } from '../lib/logger'

async function migrateTeamMembers() {
  logger.info('Starting team member migration...')

  // Get all existing team members
  const existingMembers = await prisma.teamMember.findMany({
    include: {
      teams: true,
    },
  })

  logger.info(`Found ${existingMembers.length} existing team member records`)

  // Group by custId to find duplicates
  const membersByCustId = new Map<number, typeof existingMembers>()

  for (const member of existingMembers) {
    const existing = membersByCustId.get(member.custId) || []
    existing.push(member)
    membersByCustId.set(member.custId, existing)
  }

  logger.info(`Found ${membersByCustId.size} unique iRacing customer IDs`)

  // Delete all existing team members (we'll recreate them)
  await prisma.teamMember.deleteMany({})
  logger.info('Deleted all existing team member records')

  // Now we'll apply the schema changes manually
  logger.info('\nPlease run the schema migration now.')
  logger.info(
    'After running the migration, re-run this script with --create flag to recreate the data'
  )
}

async function recreateTeamMembers() {
  logger.info('Recreating team members with new structure...')

  // Get all teams with their old member data stored somewhere
  // Since we deleted the data, we'll need to fetch fresh from iRacing API
  const teams = await prisma.team.findMany()

  logger.info(`Found ${teams.length} teams to sync`)

  const { fetchTeamMembers } = await import('../lib/iracing')

  for (const team of teams) {
    logger.info(`\nSyncing team: ${team.name} (ID: ${team.iracingTeamId})`)

    try {
      const members = await fetchTeamMembers(team.iracingTeamId)
      logger.info(`  Found ${members.length} members from API`)

      for (const member of members) {
        // Find or create team member
        let teamMember = await prisma.teamMember.findUnique({
          where: { custId: member.custId },
        })

        if (!teamMember) {
          teamMember = await prisma.teamMember.create({
            data: {
              custId: member.custId,
              displayName: member.displayName,
            },
          })
          logger.info(`  Created new TeamMember for ${member.displayName} (${member.custId})`)
        }

        // Create role for this team
        await prisma.teamMemberRole.create({
          data: {
            teamMemberId: teamMember.id,
            teamId: team.id,
            isOwner: member.owner || false,
            isAdmin: member.admin || false,
          },
        })

        // Connect team member to team
        await prisma.team.update({
          where: { id: team.id },
          data: {
            teamMembers: {
              connect: { id: teamMember.id },
            },
          },
        })
      }

      logger.info(`  ✓ Synced ${members.length} members for ${team.name}`)
    } catch (error) {
      logger.error({ err: error, teamName: team.name }, '  ✗ Failed to sync team')
    }
  }

  logger.info('\n✓ Migration complete!')
}

const args = process.argv.slice(2)
if (args.includes('--create')) {
  recreateTeamMembers()
    .catch((err) => logger.error({ err }, 'Failed to recreate team members'))
    .finally(() => prisma.$disconnect())
} else {
  migrateTeamMembers()
    .catch((err) => logger.error({ err }, 'Failed to migrate team members'))
    .finally(() => prisma.$disconnect())
}
