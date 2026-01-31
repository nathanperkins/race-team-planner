import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const sebringId = 'cmk4taiyi0000kko837utrgwg'
  const daytonaId = 'cmk4taiyo0001kko8vmdko9av'

  const sebring = await prisma.event.upsert({
    where: { id: sebringId },
    update: {
      name: '[MOCK] Sebring 12hr',
      track: 'Mock Raceway Park',
      description:
        'THIS IS MOCK DATA. The classic 12 hour endurance race around the bumps of Sebring.',
    },
    create: {
      id: sebringId,
      name: '[MOCK] Sebring 12hr',
      track: 'Mock Raceway Park',
      startTime: new Date('2026-03-20T14:00:00Z'),
      endTime: new Date('2026-03-21T02:00:00Z'),
      description:
        'THIS IS MOCK DATA. The classic 12 hour endurance race around the bumps of Sebring.',
    },
  })

  const sebringRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: sebring.id, startTime: sebring.startTime } },
    update: {},
    create: {
      eventId: sebring.id,
      startTime: sebring.startTime,
      endTime: new Date('2026-03-21T02:00:00Z'),
    },
  })

  const daytona = await prisma.event.upsert({
    where: { id: daytonaId },
    update: {
      name: '[MOCK] Daytona 24hr',
      track: 'Simulated Speedway',
      description: 'THIS IS MOCK DATA. The start of the IMSA season, twice around the clock.',
    },
    create: {
      id: daytonaId,
      name: '[MOCK] Daytona 24hr',
      track: 'Simulated Speedway',
      startTime: new Date('2026-01-24T18:40:00Z'),
      endTime: new Date('2026-01-25T18:40:00Z'),
      description: 'THIS IS MOCK DATA. The start of the IMSA season, twice around the clock.',
    },
  })

  const daytonaRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: daytona.id, startTime: daytona.startTime } },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: daytona.startTime,
      endTime: new Date('2026-01-25T18:40:00Z'),
    },
  })

  const daytonaRace2 = await prisma.race.upsert({
    where: {
      eventId_startTime: { eventId: daytona.id, startTime: new Date('2026-01-25T06:40:00Z') },
    },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: new Date('2026-01-25T06:40:00Z'),
      endTime: new Date('2026-01-26T06:40:00Z'),
    },
  })

  const gt3 = await prisma.carClass.upsert({
    where: { externalId: 1001 },
    update: {
      name: '[MOCK] GT3 Class',
      shortName: 'MOCK GT3',
    },
    create: {
      externalId: 1001,
      name: '[MOCK] GT3 Class',
      shortName: 'MOCK GT3',
    },
  })

  const lmp2 = await prisma.carClass.upsert({
    where: { externalId: 1002 },
    update: {
      name: '[MOCK] LMP2 Class',
      shortName: 'MOCK LMP2',
    },
    create: {
      externalId: 1002,
      name: '[MOCK] LMP2 Class',
      shortName: 'MOCK LMP2',
    },
  })

  const gtp = await prisma.carClass.upsert({
    where: { externalId: 1003 },
    update: {
      name: '[MOCK] GTP Class',
      shortName: 'MOCK GTP',
    },
    create: {
      externalId: 1003,
      name: '[MOCK] GTP Class',
      shortName: 'MOCK GTP',
    },
  })

  // Connect events to car classes
  await prisma.event.update({
    where: { id: sebringId },
    data: {
      carClasses: {
        connect: [{ id: gt3.id }, { id: lmp2.id }, { id: gtp.id }],
      },
    },
  })

  await prisma.event.update({
    where: { id: daytonaId },
    data: {
      carClasses: {
        connect: [{ id: gt3.id }, { id: lmp2.id }, { id: gtp.id }],
      },
    },
  })

  const alice = await prisma.user.upsert({
    where: { id: 'user_alice' },
    update: {
      name: 'Mock Alice (AI)',
    },
    create: {
      id: 'user_alice',
      email: 'alice@example.com',
      name: 'Mock Alice (AI)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Alice',
    },
  })

  const bob = await prisma.user.upsert({
    where: { id: 'user_bob' },
    update: {
      name: 'Mock Bob (Builder)',
    },
    create: {
      id: 'user_bob',
      email: 'bob@example.com',
      name: 'Mock Bob (Builder)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Bob',
    },
  })

  const bobRegistration = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: bob.id,
        raceId: daytonaRace1.id,
      },
    },
    update: {
      carClassId: gt3.id,
      notes: 'Any GT3 car works.',
    },
    create: {
      userId: bob.id,
      raceId: daytonaRace1.id,
      carClassId: gt3.id,
      notes: 'Any GT3 car works.',
    },
  })

  const charlie = await prisma.user.upsert({
    where: { id: 'user_charlie' },
    update: {
      name: 'Mock Charlie (Tester)',
    },
    create: {
      id: 'user_charlie',
      email: 'charlie@example.com',
      name: 'Mock Charlie (Tester)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Charlie',
    },
  })

  // Add stats for Bob (active iRacing data)
  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: bob.id, categoryId: 5 } },
    update: {},
    create: {
      userId: bob.id,
      categoryId: 5,
      category: 'sports_car',
      irating: 2850,
      licenseLevel: 18, // A 3.xx
      licenseGroup: 5, // A
      safetyRating: 3.42,
      cpi: 75.0,
      ttRating: 1350,
      mprNumRaces: 4,
      color: '0153db', // Blue
      groupName: 'Class A',
    },
  })

  // Add stats for Charlie (Rookie/Low level)
  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: charlie.id, categoryId: 6 } },
    update: {},
    create: {
      userId: charlie.id,
      categoryId: 6,
      category: 'formula_car',
      irating: 1450,
      licenseLevel: 10, // C 2.xx
      licenseGroup: 3, // C
      safetyRating: 2.15,
      cpi: 45.0,
      ttRating: 1300,
      mprNumRaces: 2,
      color: 'feec04', // Yellow
      groupName: 'Class C',
    },
  })

  const charlieRegistration = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: charlie.id,
        raceId: daytonaRace1.id,
      },
    },
    update: {
      carClassId: lmp2.id,
      notes: 'Ready to race!',
    },
    create: {
      userId: charlie.id,
      raceId: daytonaRace1.id,
      carClassId: lmp2.id,
      notes: 'Ready to race!',
    },
  })

  const charlieRegistrationRace2 = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: charlie.id,
        raceId: daytonaRace2.id,
      },
    },
    update: {
      carClassId: gtp.id,
      notes: 'Double duty!',
    },
    create: {
      userId: charlie.id,
      raceId: daytonaRace2.id,
      carClassId: gtp.id,
      notes: 'Double duty!',
    },
  })

  const charlieRegistrationSebring = await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: charlie.id,
        raceId: sebringRace1.id,
      },
    },
    update: {
      carClassId: gtp.id,
      notes: 'Hunting for the win.',
    },
    create: {
      userId: charlie.id,
      raceId: sebringRace1.id,
      carClassId: gtp.id,
      notes: 'Hunting for the win.',
    },
  })

  const pastSebringId = 'past_sebring_2025'
  const pastSebring = await prisma.event.upsert({
    where: { id: pastSebringId },
    update: {
      name: '[MOCK] Sebring 12hr (2025)',
      track: 'Mock Raceway Park',
      description: "THIS IS MOCK DATA. Last year's classic.",
    },
    create: {
      id: pastSebringId,
      name: '[MOCK] Sebring 12hr (2025)',
      track: 'Mock Raceway Park',
      startTime: new Date('2025-03-15T14:00:00Z'),
      endTime: new Date('2025-03-16T02:00:00Z'),
      description: "THIS IS MOCK DATA. Last year's classic.",
    },
  })

  const pastSebringRace = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: pastSebring.id, startTime: pastSebring.startTime } },
    update: {},
    create: {
      eventId: pastSebring.id,
      startTime: pastSebring.startTime,
      endTime: pastSebring.endTime,
    },
  })

  const pastAliceRegistration = await prisma.registration.upsert({
    where: { userId_raceId: { userId: alice.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: alice.id, raceId: pastSebringRace.id, carClassId: gt3.id },
  })

  const pastBobRegistration = await prisma.registration.upsert({
    where: { userId_raceId: { userId: bob.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: bob.id, raceId: pastSebringRace.id, carClassId: gt3.id },
  })

  const pastCharlieRegistration = await prisma.registration.upsert({
    where: { userId_raceId: { userId: charlie.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: charlie.id, raceId: pastSebringRace.id, carClassId: gt3.id },
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
    pastCharlieRegistration
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
