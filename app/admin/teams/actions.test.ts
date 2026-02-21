import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { batchAssignTeams } from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { sendTeamsAssignmentNotification } from '@/app/actions'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    race: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    registration: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    manualDriver: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  sendTeamsAssignmentNotification: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('batchAssignTeams', () => {
  const mockSession = {
    user: { id: 'admin-1', role: 'ADMIN' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Discord notification after batch assigning teams', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock the race with existing snapshot and no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      teamsAssigned: true,
      discordTeamsSnapshot: {
        'reg-1': { teamId: 'team-1', driverName: 'Alice' },
      },
      discordTeamThreads: null,
    } as any)

    // Mock the transaction to execute successfully
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback({
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ teamId: null }),
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: 'driver-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      } as any)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [
      { registrationId: 'reg-1', teamId: 'team-2' }, // Moving Alice from team-1 to team-2
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that sendTeamsAssignmentNotification was called
    expect(sendTeamsAssignmentNotification).toHaveBeenCalledWith(raceId)
  })

  it('preserves car class when updating existing registrations', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock race with no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      discordTeamThreads: null,
    } as any)

    // Track the mock functions for assertions
    const mockUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
    const mockFindUnique = vi.fn().mockResolvedValue({ teamId: null })
    const mockFindMany = vi.fn().mockResolvedValue([])

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback({
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: mockFindMany,
          updateMany: mockUpdateMany,
          findUnique: mockFindUnique,
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: 'driver-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      } as any)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [
      { registrationId: 'reg-1', teamId: 'team-2' }, // Existing registration
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that updateMany was called with ONLY teamId (not raceId or carClassId)
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['reg-1'] } },
      data: {
        teamId: 'team-2',
      },
    })
  })

  it('inherits car class from team when creating new manual driver', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock race with no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      discordTeamThreads: null,
    } as any)

    // Track the mock functions for assertions
    const mockCreate = vi.fn().mockResolvedValue({})
    const mockFindFirst = vi
      .fn()
      // First call: find manual driver (returns null, will create new)
      .mockResolvedValueOnce(null)
      // Second call: check if registration already exists (returns null)
      .mockResolvedValueOnce(null)
      // Third call: find team's existing registration to get car class
      .mockResolvedValueOnce({ carClassId: 'class-lmp2' })

    // Track the transaction client for assertions
    let transactionClient: any = null

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      transactionClient = {
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ teamId: null }),
          findFirst: mockFindFirst,
          create: mockCreate,
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: mockFindFirst,
          findMany: vi.fn().mockImplementation((args) => {
            if (args.where?.name?.in) {
              const names = args.where.name.in
              return Promise.resolve(
                names.map((name: string) => ({
                  id: `manual-${name.toLowerCase().replace(/\s+/g, '-')}`,
                  name,
                  irating: 1500,
                }))
              )
            }
            return Promise.resolve([])
          }),
          create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      }
      return callback(transactionClient)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [
      {
        manualName: 'New Driver',
        manualIR: 1500,
        teamId: 'team-1',
      },
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that the new registration uses the team's car class (LMP2), not the provided GT3
    expect(transactionClient.registration.createMany).toHaveBeenCalledWith({
      data: [
        {
          manualDriverId: 'manual-new-driver',
          teamId: 'team-1',
          raceId: 'race-123',
          carClassId: 'class-gt3',
        },
      ],
    })
  })

  it('falls back to provided car class when team has no existing members', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock race with no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      discordTeamThreads: null,
    } as any)

    // Track the mock functions for assertions
    const mockCreate = vi.fn().mockResolvedValue({})
    const mockFindFirst = vi
      .fn()
      // First call: find manual driver (returns null, will create new)
      .mockResolvedValueOnce(null)
      // Second call: find team's registration (no existing members)
      .mockResolvedValueOnce(null)

    // Track the transaction client for assertions
    let transactionClient: any = null

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      transactionClient = {
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ teamId: null }),
          findFirst: mockFindFirst,
          create: mockCreate,
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: mockFindFirst,
          findMany: vi.fn().mockImplementation((args) => {
            if (args.where?.name?.in) {
              const names = args.where.name.in
              return Promise.resolve(
                names.map((name: string) => ({
                  id: `manual-${name.toLowerCase().replace(/\s+/g, '-')}`,
                  name: name,
                  irating: 1500,
                }))
              )
            }
            return Promise.resolve([])
          }),
          create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      }
      return callback(transactionClient)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [
      {
        manualName: 'New Driver',
        manualIR: 1500,
        teamId: 'team-1',
      },
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that the new registration uses the provided car class (GT3) as fallback
    expect(transactionClient.registration.createMany).toHaveBeenCalledWith({
      data: [
        {
          manualDriverId: 'manual-new-driver',
          teamId: 'team-1',
          raceId: 'race-123',
          carClassId: 'class-gt3',
        },
      ],
    })
  })

  it('handles mixed assignment of existing and new drivers correctly', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock race with no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      discordTeamThreads: null,
    } as any)

    // Track the transaction client for assertions
    let transactionClient: any = null

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      transactionClient = {
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: vi.fn().mockResolvedValue([
            { id: 'reg-1', teamId: 'team-1' },
            { id: 'reg-2', teamId: 'team-1' },
          ]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({ teamId: 'team-1' }),
          findFirst: vi
            .fn()
            // First call: find manual driver (returns null, will create)
            .mockResolvedValueOnce(null)
            // Second call: find team's existing registration for car class
            .mockResolvedValueOnce({ carClassId: 'class-lmp2' }),
          create: vi.fn().mockResolvedValue({}),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: vi
            .fn()
            // First call: find manual driver (returns null, will create)
            .mockResolvedValueOnce(null)
            // Second call: find team's existing registration for car class
            .mockResolvedValueOnce({ carClassId: 'class-lmp2' }),
          findMany: vi.fn().mockImplementation((args) => {
            if (args.where?.name?.in) {
              const names = args.where.name.in
              return Promise.resolve(
                names.map((name: string) => ({
                  id: `manual-${name.toLowerCase().replace(/\s+/g, '-')}`,
                  name: name,
                  irating: 1500,
                }))
              )
            }
            return Promise.resolve([])
          }),
          create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      }
      return callback(transactionClient)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [
      // Existing user being moved to a different team
      { registrationId: 'reg-1', teamId: 'team-2' },
      // New manual driver being added to team with existing members
      {
        manualName: 'New Driver',
        manualIR: 1500,
        teamId: 'team-2',
      },
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify existing registration only had teamId updated
    expect(transactionClient.registration.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['reg-1'] } },
      data: {
        teamId: 'team-2',
      },
    })

    // Verify new manual driver inherited car class from team
    expect(transactionClient.registration.createMany).toHaveBeenCalledWith({
      data: [
        {
          manualDriverId: 'manual-new-driver',
          teamId: 'team-2',
          raceId: 'race-123',
          carClassId: 'class-gt3', // Using provided car class
        },
      ],
    })

    // Verify notification was sent
    expect(sendTeamsAssignmentNotification).toHaveBeenCalledWith(raceId)
  })

  it('sets teamsAssigned flag to true after batch assignment', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    // Mock race with no Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      discordTeamThreads: null,
    } as any)

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback({
        ...prisma,
        registration: {
          ...prisma.registration,
          findMany: vi.fn().mockResolvedValue([
            { id: 'reg-1', teamId: 'team-1' },
            { id: 'reg-2', teamId: 'team-1' },
          ]),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({ teamId: 'team-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        manualDriver: {
          ...prisma.manualDriver,
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockImplementation((args) => {
            if (args.where?.name?.in) {
              const names = args.where.name.in
              return Promise.resolve(
                names.map((name: string) => ({
                  id: `manual-${name.toLowerCase().replace(/\s+/g, '-')}`,
                  name: name,
                  irating: 1500,
                }))
              )
            }
            return Promise.resolve([])
          }),
          create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
      } as any)
    })
    vi.mocked(prisma.race as any).update = vi.fn().mockResolvedValue({})

    const assignments = [{ registrationId: 'reg-1', teamId: 'team-2' }]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that the race's teamsAssigned flag was set to true
    expect(prisma.race.update).toHaveBeenCalledWith({
      where: { id: raceId },
      data: { teamsAssigned: true },
    })
  })
})
