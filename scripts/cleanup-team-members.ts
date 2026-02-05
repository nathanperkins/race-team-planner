import prisma from '../lib/prisma'

async function cleanupTeamMembers() {
  console.log('Deleting all TeamMember records...')

  const result = await prisma.teamMember.deleteMany()
  console.log(`✓ Deleted ${result.count} TeamMember records`)

  await prisma.$disconnect()
}

cleanupTeamMembers().catch(console.error)
