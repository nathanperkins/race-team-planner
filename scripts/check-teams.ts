import prisma from '../lib/prisma'

async function main() {
  const teams = await prisma.team.findMany()
  console.log('Current teams in database:')
  teams.forEach((team) => {
    console.log(`  ID: ${team.id}`)
    console.log(`  Name: ${team.name}`)
    console.log(`  iRacing Team ID: ${team.iracingTeamId}`)
    console.log(`  ---`)
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
