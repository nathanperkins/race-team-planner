import prisma from '../lib/prisma'

async function main() {
  console.log('Deleting teams with negative iRacing Team IDs...')

  const result = await prisma.team.deleteMany({
    where: {
      iracingTeamId: {
        lt: 0,
      },
    },
  })

  console.log(`Deleted ${result.count} teams with negative IDs`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
