import prisma from '../lib/prisma'

async function migrateTeamMembers() {
  console.log('Starting team member migration...')

  // Get all existing team members
  const existingMembers = await prisma.teamMember.findMany({
    include: {
      teams: true,
    },
  })

  console.log(`Found ${existingMembers.length} existing team member records`)

  // Group by custId to find duplicates
  const membersByCustId = new Map<number, typeof existingMembers>()

  for (const member of existingMembers) {
    const existing = membersByCustId.get(member.custId) || []
    existing.push(member)
    membersByCustId.set(member.custId, existing)
  }

  console.log(`Found ${membersByCustId.size} unique iRacing customer IDs`)

  // Delete all existing team members (we'll recreate them)
  await prisma.teamMember.deleteMany({})
  console.log('Deleted all existing team member records')

  // Now we'll apply the schema changes manually
  console.log('\nPlease run the schema migration now.')
  console.log(
    'After running the migration, re-run this script with --create flag to recreate the data'
  )
}

async function recreateTeamMembers() {
  console.log('Recreating team members with new structure...')

  // Get all teams with their old member data stored somewhere
  // Since we deleted the data, we'll need to fetch fresh from iRacing API
  const teams = await prisma.team.findMany()

  console.log(`Found ${teams.length} teams to sync`)

  const { fetchTeamMembers } = await import('../lib/iracing')

  for (const team of teams) {
    console.log(`\nSyncing team: ${team.name} (ID: ${team.iracingTeamId})`)

    try {
      const members = await fetchTeamMembers(team.iracingTeamId)
      console.log(`  Found ${members.length} members from API`)

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
          console.log(`  Created new TeamMember for ${member.displayName} (${member.custId})`)
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

      console.log(`  ✓ Synced ${members.length} members for ${team.name}`)
    } catch (error) {
      console.error(`  ✗ Failed to sync team ${team.name}:`, error)
    }
  }

  console.log('\n✓ Migration complete!')
}

const args = process.argv.slice(2)
if (args.includes('--create')) {
  recreateTeamMembers()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
} else {
  migrateTeamMembers()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
}
