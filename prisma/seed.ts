import { PrismaClient } from '@prisma/client'
import { dateWithTime } from '../lib/date-utils'

const prisma = new PrismaClient()

async function main() {
  const sebringId = 'cmk4taiyi0000kko837utrgwg'
  const daytonaId = 'cmk4taiyo0001kko8vmdko9av'

  // Future event: 30 days from now at 2:00 PM
  const sebringStart = dateWithTime(30, 14, 0)
  const sebring = await prisma.event.upsert({
    where: { id: sebringId },
    update: {
      name: '[MOCK] Sebring 12hr',
      track: 'Mock Raceway Park',
      description:
        'THIS IS MOCK DATA. The classic 12 hour endurance race around the bumps of Sebring.',
      licenseGroup: 3, // Class C
    },
    create: {
      id: sebringId,
      name: '[MOCK] Sebring 12hr',
      track: 'Mock Raceway Park',
      startTime: sebringStart,
      endTime: new Date(sebringStart.getTime() + 12 * 60 * 60 * 1000), // +12 hours
      description:
        'THIS IS MOCK DATA. The classic 12 hour endurance race around the bumps of Sebring.',
      tempValue: 78,
      tempUnits: 0,
      relHumidity: 65,
      skies: 1,
      precipChance: 15,
      licenseGroup: 3, // Class C
    },
  })

  const sebringRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: sebring.id, startTime: sebring.startTime } },
    update: {},
    create: {
      eventId: sebring.id,
      startTime: sebring.startTime,
      endTime: new Date(sebringStart.getTime() + 12 * 60 * 60 * 1000),
    },
  })

  // Second race slot: 31 days from now at 6:00 AM
  const sebringRace2Start = dateWithTime(31, 6, 0)
  const sebringRace2 = await prisma.race.upsert({
    where: {
      eventId_startTime: { eventId: sebring.id, startTime: sebringRace2Start },
    },
    update: {},
    create: {
      eventId: sebring.id,
      startTime: sebringRace2Start,
      endTime: new Date(sebringRace2Start.getTime() + 12 * 60 * 60 * 1000),
    },
  })

  // Completed event: 1 day ago at 10:40 AM
  const daytonaStart = dateWithTime(-1, 10, 40)
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
      startTime: daytonaStart, // 1 day ago (completed)
      endTime: new Date(daytonaStart.getTime() + 12 * 60 * 60 * 1000), // +12 hours
      description: 'THIS IS MOCK DATA. The start of the IMSA season, twice around the clock.',
      tempValue: 68,
      tempUnits: 0,
      relHumidity: 45,
      skies: 0,
      precipChance: 0,
    },
  })

  const daytonaRace1 = await prisma.race.upsert({
    where: { eventId_startTime: { eventId: daytona.id, startTime: daytona.startTime } },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: daytona.startTime,
      endTime: new Date(daytonaStart.getTime() + 12 * 60 * 60 * 1000),
    },
  })

  const daytonaRace2Start = new Date(daytonaStart.getTime() + 6 * 60 * 60 * 1000) // +6 hours from race 1
  const daytonaRace2 = await prisma.race.upsert({
    where: {
      eventId_startTime: { eventId: daytona.id, startTime: daytonaRace2Start },
    },
    update: {},
    create: {
      eventId: daytona.id,
      startTime: daytonaRace2Start,
      endTime: new Date(daytonaRace2Start.getTime() + 18 * 60 * 60 * 1000),
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

  // Teams for selection
  const teamRed = await prisma.team.upsert({
    where: { id: 'team_red' },
    update: { name: '[MOCK] Team Red Racing' },
    create: {
      id: 'team_red',
      iracingTeamId: 10001,
      name: '[MOCK] Team Red Racing',
    },
  })

  const teamBlue = await prisma.team.upsert({
    where: { id: 'team_blue' },
    update: { name: '[MOCK] Team Blue Motorsports' },
    create: {
      id: 'team_blue',
      iracingTeamId: 10002,
      name: '[MOCK] Team Blue Motorsports',
    },
  })

  const teamGreen = await prisma.team.upsert({
    where: { id: 'team_green' },
    update: { name: '[MOCK] Team Green Performance' },
    create: {
      id: 'team_green',
      iracingTeamId: 10003,
      name: '[MOCK] Team Green Performance',
    },
  })

  const teamYellow = await prisma.team.upsert({
    where: { id: 'team_yellow' },
    update: { name: '[MOCK] Team Yellow Squad' },
    create: {
      id: 'team_yellow',
      iracingTeamId: 10004,
      name: '[MOCK] Team Yellow Squad',
    },
  })

  console.log('Mock teams seeded:', {
    teamRed,
    teamBlue,
    teamGreen,
    teamYellow,
  })

  const alice = await prisma.user.upsert({
    where: { id: 'user_alice' },
    update: {
      name: 'Mock Alice (AI)',
      role: 'ADMIN',
    },
    create: {
      id: 'user_alice',
      email: 'alice@example.com',
      name: 'Mock Alice (AI)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Alice',
      role: 'ADMIN',
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

  await prisma.registration.upsert({
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

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: bob.id,
        raceId: sebringRace1.id,
      },
    },
    update: {
      carClassId: gt3.id,
      notes: 'Looking forward to this one!',
    },
    create: {
      userId: bob.id,
      raceId: sebringRace1.id,
      carClassId: gt3.id,
      notes: 'Looking forward to this one!',
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

  await prisma.registration.upsert({
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

  await prisma.registration.upsert({
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

  await prisma.registration.upsert({
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

  // David (Veteran Expert)
  const david = await prisma.user.upsert({
    where: { id: 'user_david' },
    update: {
      name: 'Mock David (Expert)',
    },
    create: {
      id: 'user_david',
      email: 'david@example.com',
      name: 'Mock David (Expert)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=David',
    },
  })

  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: david.id, categoryId: 5 } },
    update: {
      irating: 4200,
      licenseLevel: 30,
      licenseGroup: 5,
      safetyRating: 4.85,
      cpi: 95.0,
      ttRating: 2100,
      mprNumRaces: 47,
      color: '00ff00',
      groupName: 'Class A',
    },
    create: {
      userId: david.id,
      categoryId: 5,
      category: 'sports_car',
      irating: 4200,
      licenseLevel: 30, // A 4.xx Pro
      licenseGroup: 5, // A
      safetyRating: 4.85,
      cpi: 95.0,
      ttRating: 2100,
      mprNumRaces: 47,
      color: '00ff00', // Green
      groupName: 'Class A',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: david.id,
        raceId: daytonaRace1.id,
      },
    },
    update: {
      carClassId: gt3.id,
      notes: 'Aiming for podium.',
    },
    create: {
      userId: david.id,
      raceId: daytonaRace1.id,
      carClassId: gt3.id,
      notes: 'Aiming for podium.',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: david.id,
        raceId: sebringRace1.id,
      },
    },
    update: {
      carClassId: gt3.id,
      notes: 'Consistent pace wins races.',
    },
    create: {
      userId: david.id,
      raceId: sebringRace1.id,
      carClassId: gt3.id,
      notes: 'Consistent pace wins races.',
    },
  })

  // Emma (Intermediate Consistent)
  const emma = await prisma.user.upsert({
    where: { id: 'user_emma' },
    update: {
      name: 'Mock Emma (Steady)',
    },
    create: {
      id: 'user_emma',
      email: 'emma@example.com',
      name: 'Mock Emma (Steady)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Emma',
    },
  })

  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: emma.id, categoryId: 5 } },
    update: {},
    create: {
      userId: emma.id,
      categoryId: 5,
      category: 'sports_car',
      irating: 2100,
      licenseLevel: 16, // B 2.xx
      licenseGroup: 4, // B
      safetyRating: 3.85,
      cpi: 65.0,
      ttRating: 1600,
      mprNumRaces: 22,
      color: 'ff6b00', // Orange
      groupName: 'Class B',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: emma.id,
        raceId: daytonaRace2.id,
      },
    },
    update: {
      carClassId: lmp2.id,
      notes: 'Prefer the night stint.',
    },
    create: {
      userId: emma.id,
      raceId: daytonaRace2.id,
      carClassId: lmp2.id,
      notes: 'Prefer the night stint.',
    },
  })

  // Frank (Rookie Rising)
  const frank = await prisma.user.upsert({
    where: { id: 'user_frank' },
    update: {
      name: 'Mock Frank (Rookie)',
    },
    create: {
      id: 'user_frank',
      email: 'frank@example.com',
      name: 'Mock Frank (Rookie)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Frank',
    },
  })

  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: frank.id, categoryId: 1 } },
    update: {},
    create: {
      userId: frank.id,
      categoryId: 1,
      category: 'road_touring',
      irating: 1050,
      licenseLevel: 6, // D 3.xx
      licenseGroup: 2, // D
      safetyRating: 1.95,
      cpi: 35.0,
      ttRating: 1200,
      mprNumRaces: 3,
      color: 'ff0000', // Red
      groupName: 'Class D',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: frank.id,
        raceId: sebringRace1.id,
      },
    },
    update: {
      carClassId: lmp2.id,
      notes: 'First endurance race!',
    },
    create: {
      userId: frank.id,
      raceId: sebringRace1.id,
      carClassId: lmp2.id,
      notes: 'First endurance race!',
    },
  })

  // Grace (Advanced Aggressive)
  const grace = await prisma.user.upsert({
    where: { id: 'user_grace' },
    update: {
      name: 'Mock Grace (Racer)',
    },
    create: {
      id: 'user_grace',
      email: 'grace@example.com',
      name: 'Mock Grace (Racer)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Grace',
    },
  })

  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: grace.id, categoryId: 6 } },
    update: {},
    create: {
      userId: grace.id,
      categoryId: 6,
      category: 'formula_car',
      irating: 3200,
      licenseLevel: 22, // A 2.xx
      licenseGroup: 5, // A
      safetyRating: 3.15,
      cpi: 80.0,
      ttRating: 1850,
      mprNumRaces: 35,
      color: 'ff00ff', // Magenta
      groupName: 'Class A',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: grace.id,
        raceId: daytonaRace1.id,
      },
    },
    update: {
      carClassId: gtp.id,
      notes: 'Attack mode enabled.',
    },
    create: {
      userId: grace.id,
      raceId: daytonaRace1.id,
      carClassId: gtp.id,
      notes: 'Attack mode enabled.',
    },
  })

  // Henry (Casual Weekend Warrior)
  const henry = await prisma.user.upsert({
    where: { id: 'user_henry' },
    update: {
      name: 'Mock Henry (Casual)',
    },
    create: {
      id: 'user_henry',
      email: 'henry@example.com',
      name: 'Mock Henry (Casual)',
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Henry',
    },
  })

  await prisma.racerStats.upsert({
    where: { userId_categoryId: { userId: henry.id, categoryId: 2 } },
    update: {
      irating: 1300,
      licenseLevel: 8,
      licenseGroup: 2,
      safetyRating: 2.45,
      cpi: 40.0,
      ttRating: 1250,
      mprNumRaces: 8,
      color: '00ccff',
      groupName: 'Class D',
    },
    create: {
      userId: henry.id,
      categoryId: 2,
      category: 'oval_touring',
      irating: 1300,
      licenseLevel: 8, // D 1.xx
      licenseGroup: 2, // D
      safetyRating: 2.45,
      cpi: 40.0,
      ttRating: 1250,
      mprNumRaces: 8,
      color: '00ccff', // Cyan
      groupName: 'Class D',
    },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: henry.id,
        raceId: sebringRace1.id,
      },
    },
    update: {
      carClassId: gtp.id,
      notes: 'Just here for fun!',
    },
    create: {
      userId: henry.id,
      raceId: sebringRace1.id,
      carClassId: gtp.id,
      notes: 'Just here for fun!',
    },
  })

  const pastSebringId = 'past_sebring_2025'
  // Old completed event: 30 days ago at 7:00 AM
  const pastSebringStart = dateWithTime(-30, 7, 0)
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
      startTime: pastSebringStart, // 1 month ago (completed)
      endTime: new Date(pastSebringStart.getTime() + 12 * 60 * 60 * 1000), // +12 hours
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

  await prisma.registration.upsert({
    where: { userId_raceId: { userId: alice.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: alice.id, raceId: pastSebringRace.id, carClassId: gt3.id },
  })

  await prisma.registration.upsert({
    where: { userId_raceId: { userId: bob.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: bob.id, raceId: pastSebringRace.id, carClassId: gt3.id },
  })

  await prisma.registration.upsert({
    where: { userId_raceId: { userId: charlie.id, raceId: pastSebringRace.id } },
    update: {},
    create: { userId: charlie.id, raceId: pastSebringRace.id, carClassId: gt3.id },
  })

  // Register drivers for Sebring Race 2 (Cross-time testing)
  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: david.id,
        raceId: sebringRace2.id,
      },
    },
    update: { carClassId: lmp2.id },
    create: { userId: david.id, raceId: sebringRace2.id, carClassId: lmp2.id },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: emma.id,
        raceId: sebringRace2.id,
      },
    },
    update: { carClassId: gt3.id },
    create: { userId: emma.id, raceId: sebringRace2.id, carClassId: gt3.id },
  })

  await prisma.registration.upsert({
    where: {
      userId_raceId: {
        userId: frank.id,
        raceId: sebringRace2.id,
      },
    },
    update: { carClassId: gtp.id },
    create: { userId: frank.id, raceId: sebringRace2.id, carClassId: gtp.id },
  })

  // Manual Driver seed
  const manualDriver = await prisma.manualDriver.upsert({
    where: { id: 'manual_driver_1' },
    update: {
      name: 'Mock Manual Racer',
      irating: 1600,
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Mock%20Manual%20Racer',
    },
    create: {
      id: 'manual_driver_1',
      name: 'Mock Manual Racer',
      irating: 1600,
      image: 'https://api.dicebear.com/9.x/avataaars/png?seed=Mock%20Manual%20Racer',
    },
  })

  await prisma.registration.upsert({
    where: { manualDriverId_raceId: { manualDriverId: manualDriver.id, raceId: daytonaRace1.id } },
    update: { carClassId: gt3.id },
    create: {
      manualDriverId: manualDriver.id,
      raceId: daytonaRace1.id,
      carClassId: gt3.id,
    },
  })

  console.log('Mock drivers seeded:', {
    alice,
    bob,
    charlie,
    david,
    emma,
    frank,
    grace,
    henry,
    manualDriver,
  })
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
