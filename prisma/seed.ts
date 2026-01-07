
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sebring = await prisma.event.create({
    data: {
      name: 'Sebring 12hr',
      track: 'Sebring International Raceway',
      startTime: new Date('2026-03-20T14:00:00Z'),
      description: 'The classic 12 hour endurance race around the bumps of Sebring.',
    },
  })

  const daytona = await prisma.event.create({
    data: {
      name: 'Daytona 24hr',
      track: 'Daytona International Speedway',
      startTime: new Date('2026-01-24T18:40:00Z'),
      description: 'The start of the IMSA season, twice around the clock.',
    },
  })

  console.log({ sebring, daytona })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
