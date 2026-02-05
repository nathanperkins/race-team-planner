import prisma from '../lib/prisma'

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
    console.log('User not found')
    return
  }

  console.log('User Details:')
  console.log('  Name:', user.name)
  console.log('  Email:', user.email)
  console.log('  iRacing Customer ID:', user.iracingCustomerId)
  console.log('  Teams:', user.teams.length)

  if (user.teams.length > 0) {
    console.log('\nTeams:')
    user.teams.forEach((team) => {
      console.log(`  - ${team.name} (iRacing ID: ${team.iracingTeamId})`)
    })
  } else {
    console.log('\n❌ No teams linked to this user')
  }

  // Check all teams
  console.log('\n--- All Teams in Database ---')
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
    console.log(`\nTeam: ${team.name} (iRacing ID: ${team.iracingTeamId})`)
    console.log(`  Members in DB: ${team.members.length}`)
    team.members.forEach((member) => {
      console.log(
        `    - ${member.name} (${member.email}) - iRacing ID: ${member.iracingCustomerId}`
      )
    })
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
