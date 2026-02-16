import { PrismaClient } from '@prisma/client'
import { logger } from '../lib/logger'

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

  logger.info('Created live event: %s with ID: %s', event.name, event.id)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    logger.error({ err: e }, 'Failed to create live event')
    await prisma.$disconnect()
    process.exit(1)
  })
