import prisma from '../lib/prisma'

async function checkDuplicates() {
  // Check TeamMember duplicates
  const members = await prisma.$queryRaw<Array<{ custId: number; count: bigint }>>`
    SELECT "custId", COUNT(*) as count 
    FROM "TeamMember" 
    GROUP BY "custId" 
    HAVING COUNT(*) > 1
  `

  console.log('\n=== TeamMember Duplicates ===')
  console.log(`Found ${members.length} custIds with duplicates:`)
  for (const m of members) {
    console.log(`  custId ${m.custId}: ${m.count} records`)
  }

  // Check total TeamMembers
  const totalMembers = await prisma.teamMember.count()
  console.log(`\nTotal TeamMember records: ${totalMembers}`)

  // Check if there's data in the junction table
  const junctionData = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count FROM "_TeamToTeamMember"
  `
  console.log(`\nJunction table (_TeamToTeamMember) records: ${junctionData[0].count}`)

  // Check User iracingId duplicates
  const userDups = await prisma.$queryRaw<Array<{ iracingId: number; count: bigint }>>`
    SELECT "iracingId", COUNT(*) as count 
    FROM "User" 
    WHERE "iracingId" IS NOT NULL
    GROUP BY "iracingId" 
    HAVING COUNT(*) > 1
  `

  console.log('\n=== User iracingId Duplicates ===')
  if (userDups.length > 0) {
    console.log(`Found ${userDups.length} iracingIds with duplicates:`)
    for (const u of userDups) {
      console.log(`  iracingId ${u.iracingId}: ${u.count} records`)
    }
  } else {
    console.log('No duplicates found!')
  }

  await prisma.$disconnect()
}

checkDuplicates().catch(console.error)
