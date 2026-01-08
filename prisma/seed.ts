import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sebringId = 'cmk4taiyi0000kko837utrgwg'
  const daytonaId = 'cmk4taiyo0001kko8vmdko9av'

  const sebring = await prisma.event.upsert({
    where: { id: sebringId },
    update: {},
    create: {
      id: sebringId,
      name: 'Sebring 12hr',
      track: 'Sebring International Raceway',
      startTime: new Date('2026-03-20T14:00:00Z'),
      endTime: new Date('2026-03-21T02:00:00Z'), // 12 hours later
      description: 'The classic 12 hour endurance race around the bumps of Sebring.',
    },
  })

  const daytona = await prisma.event.upsert({
    where: { id: daytonaId },
    update: {},
    create: {
      id: daytonaId,
      name: 'Daytona 24hr',
      track: 'Daytona International Speedway',
      startTime: new Date('2026-01-24T18:40:00Z'),
      endTime: new Date('2026-01-25T18:40:00Z'), // 24 hours later
      description: 'The start of the IMSA season, twice around the clock.',
    },
  })

  const alice = await prisma.user.upsert({
    where: { id: 'user_alice' },
    update: {
      email: 'alice@example.com',
      name: 'Alice Admin',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Alice',
    },
    create: {
      id: 'user_alice',
      email: 'alice@example.com',
      name: 'Alice Admin',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Alice',
    }
  })


  const bob = await prisma.user.upsert({
    where: { id: 'user_bob' },
    update: {
      email: 'bob@example.com',
      name: 'Bob Builder',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Bob',
    },
    create: {
      id: 'user_bob',
      email: 'bob@example.com',
      name: 'Bob Builder',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Bob',
    }
  })

  const bobRegistration = await prisma.registration.upsert({
    where: {
      userId_eventId: {
        userId: bob.id,
        eventId: daytona.id,
      }
    },
    update: {
      carClass: 'GT3',
      preferredTimeslot: 'Night Stints',
      notes: 'Any GT3 car works.'
    },
    create: {
      userId: bob.id,
      eventId: daytona.id,
      carClass: 'GT3',
      preferredTimeslot: 'Night Stints',
      notes: 'Any GT3 car works.'
    }
  })

  const charlie = await prisma.user.upsert({
    where: { id: 'user_charlie' },
    update: {
      email: 'charlie@example.com',
      name: 'Charlie Driver',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Charlie',
    },
    create: {
      id: 'user_charlie',
      email: 'charlie@example.com',
      name: 'Charlie Driver',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Charlie',
    }
  })

  const charlieRegistration = await prisma.registration.upsert({
    where: {
      userId_eventId: {
        userId: charlie.id,
        eventId: daytona.id,
      }
    },
    update: {
      carClass: 'LMP2',
      preferredTimeslot: 'Daytime',
      notes: 'Ready to race!',
    },
    create: {
      userId: charlie.id,
      eventId: daytona.id,
      carClass: 'LMP2',
      preferredTimeslot: 'Daytime',
      notes: 'Ready to race!',
    }
  })

  const charlieRegistration2 = await prisma.registration.upsert({
    where: {
      userId_eventId: {
        userId: charlie.id,
        eventId: sebring.id,
      }
    },
    update: {
      carClass: 'GTP',
      preferredTimeslot: 'Evening',
      notes: 'Hunting for the win.'
    },
    create: {
      userId: charlie.id,
      eventId: sebring.id,
      carClass: 'GTP',
      preferredTimeslot: 'Evening',
      notes: 'Hunting for the win.'
    }
  })

  // Past Event: 2025 Sebring 12h
  const pastSebringId = 'past_sebring_2025'
  const pastSebring = await prisma.event.upsert({
    where: { id: pastSebringId },
    update: {},
    create: {
        id: pastSebringId,
        name: 'Sebring 12hr (2025)',
        track: 'Sebring International Raceway',
        startTime: new Date('2025-03-15T14:00:00Z'),
        endTime: new Date('2025-03-16T02:00:00Z'),
        description: 'Last year\'s classic.',
    }
  })

  // Register everyone for the past event
  const pastAliceRegistration = await prisma.registration.upsert({
      where: { userId_eventId: { userId: alice.id, eventId: pastSebringId } },
      update: {},
      create: { userId: alice.id, eventId: pastSebringId, carClass: 'GT3', preferredTimeslot: 'Any' }
  })

  const pastBobRegistration = await prisma.registration.upsert({
      where: { userId_eventId: { userId: bob.id, eventId: pastSebringId } },
      update: {},
      create: { userId: bob.id, eventId: pastSebringId, carClass: 'GT3', preferredTimeslot: 'Any' }
  })

  const pastCharlieRegistration = await prisma.registration.upsert({
      where: { userId_eventId: { userId: charlie.id, eventId: pastSebringId } },
      update: {},
      create: { userId: charlie.id, eventId: pastSebringId, carClass: 'GT3', preferredTimeslot: 'Any' }
  })

  console.log(
    sebring,
    daytona,
    pastSebring,
    alice,
    bob,
    charlie,
    bobRegistration,
    charlieRegistration,
    charlieRegistration2,
    pastAliceRegistration,
    pastBobRegistration,
    pastCharlieRegistration,
  )
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
