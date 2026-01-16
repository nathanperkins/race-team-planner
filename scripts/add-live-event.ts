import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const now = new Date()
  const startTime = new Date(now.getTime() - 30 * 60 * 1000) // 30 mins ago
  const endTime = new Date(now.getTime() + 30 * 60 * 1000) // 30 mins from now

  const event = await prisma.event.create({
    data: {
      name: 'Live Test Event',
      track: 'Test Track',
      startTime,
      endTime,
      description: 'A manually created event to test the live indicator.',
      races: {
        create: {
          startTime,
          endTime,
        },
      },
    },
  })

  console.log('Created live event:', event.name, 'with ID:', event.id)
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
