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
      endTime: new Date('2026-03-21T02:00:00Z'),
      description: 'The classic 12 hour endurance race around the bumps of Sebring.',
    },
  })

  const sebringRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: sebring.id, startTime: sebring.startTime } },
    update: {},
    create: {
      eventId: sebring.id,
      startTime: sebring.startTime,
      endTime: new Date('2026-03-21T02:00:00Z'),
    }
  })

  const daytona = await prisma.event.upsert({
    where: { id: daytonaId },
    update: {},
    create: {
      id: daytonaId,
      name: 'Daytona 24hr',
      track: 'Daytona International Speedway',
      startTime: new Date('2026-01-24T18:40:00Z'),
      endTime: new Date('2026-01-25T18:40:00Z'),
      description: 'The start of the IMSA season, twice around the clock.',
    },
  })

  const daytonaRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: daytona.id, startTime: daytona.startTime } },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: daytona.startTime,
      endTime: new Date('2026-01-25T18:40:00Z'),
    }
  })

  const daytonaRace2 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: daytona.id, startTime: new Date('2026-01-25T06:40:00Z') } },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: new Date('2026-01-25T06:40:00Z'),
      endTime: new Date('2026-01-26T06:40:00Z'),
    }
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
      userId_raceId: {
        userId: bob.id,
        raceId: daytonaRace1.id,
      }
    },
    update: {
      carClass: 'GT3',
      notes: 'Any GT3 car works.'
    },
    create: {
      userId: bob.id,
      raceId: daytonaRace1.id,
      carClass: 'GT3',
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
      userId_raceId: {
        userId: charlie.id,
        raceId: daytonaRace1.id,
      }
    },
    update: {
      carClass: 'LMP2',
      notes: 'Ready to race!',
    },
    create: {
      userId: charlie.id,
      raceId: daytonaRace1.id,
      carClass: 'LMP2',
      notes: 'Ready to race!',
    }
  })

  const charlieRegistrationRace2 = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: charlie.id,
        raceId: daytonaRace2.id,
      }
    },
    update: {
      carClass: 'GTP',
      notes: 'Double duty!'
    },
    create: {
      userId: charlie.id,
      raceId: daytonaRace2.id,
      carClass: 'GTP',
      notes: 'Double duty!'
    }
  })

  const charlieRegistrationSebring = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: charlie.id,
        raceId: sebringRace1.id,
      }
    },
    update: {
      carClass: 'GTP',
      notes: 'Hunting for the win.'
    },
    create: {
      userId: charlie.id,
      raceId: sebringRace1.id,
      carClass: 'GTP',
      notes: 'Hunting for the win.'
    }
  })

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

  const pastSebringRace = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: pastSebring.id, startTime: pastSebring.startTime } },
    update: {},
    create: {
      eventId: pastSebring.id,
      startTime: pastSebring.startTime,
      endTime: pastSebring.endTime,
    }
  })

  const pastAliceRegistration = await prisma.registration.upsert({
      where: { userId_raceId: { userId: alice.id, raceId: pastSebringRace.id } },
      update: {},
      create: { userId: alice.id, raceId: pastSebringRace.id, carClass: 'GT3' }
  })

  const pastBobRegistration = await prisma.registration.upsert({
      where: { userId_raceId: { userId: bob.id, raceId: pastSebringRace.id } },
      update: {},
      create: { userId: bob.id, raceId: pastSebringRace.id, carClass: 'GT3' }
  })

  const pastCharlieRegistration = await prisma.registration.upsert({
      where: { userId_raceId: { userId: charlie.id, raceId: pastSebringRace.id } },
      update: {},
      create: { userId: charlie.id, raceId: pastSebringRace.id, carClass: 'GT3' }
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
    charlieRegistrationRace2,
    charlieRegistrationSebring,
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
