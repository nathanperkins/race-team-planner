import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  adminRegisterDriver,
  registerForRace,
  sendTeamsAssignmentNotification,
  updateRegistrationCarClass,
} from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  createOrUpdateEventThread,
  createOrUpdateTeamThread,
  sendRegistrationNotification,
} from '@/lib/discord'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    race: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registration: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    manualDriver: {
      findUnique: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock discord
vi.mock('@/lib/discord', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/discord')>()),
  createOrUpdateEventThread: vi.fn(),
  createOrUpdateTeamThread: vi.fn(),
  addUsersToThread: vi.fn(),
  sendRegistrationNotification: vi.fn(),
  sendTeamsAssignedNotification: vi.fn(),
}))

describe('sendTeamsAssignmentNotification', () => {
  const raceId = 'race-123'
  const mockSession = {
    user: { id: 'admin-1', role: 'ADMIN' },
  }
  const raceStartTime = new Date('2024-05-01T20:00:00Z')

  const setupMockRace = (overrides = {}) => {
    return {
      id: raceId,
      startTime: raceStartTime,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: null,
      event: {
        id: 'event-123',
        name: 'GT3 Challenge',
        track: 'Spa',
        trackConfig: 'Endurance',
        tempValue: 75,
        precipChance: 10,
        carClasses: [{ name: 'GT3' }],
        customCarClasses: [],
      },
      ...overrides,
    }
  }

  const setupMockRegistration = (id: string, teamId: string | null, teamName?: string) => {
    return {
      id: `reg-${id}`,
      userId: `user-${id}`,
      teamId,
      team: teamId ? { id: teamId, name: teamName || `Team ${id}` } : null,
      carClass: { name: 'GT3', shortName: 'GT3' },
      user: {
        name: `User ${id}`,
        accounts: [{ providerAccountId: `discord-${id}` }],
        racerStats: [{ categoryId: 5, category: 'Sports Car', irating: 2000 }],
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      { id: 'team-1', name: 'Team One' },
      { id: 'team-2', name: 'Team Two' },
    ] as any)
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.DISCORD_GUILD_ID = 'guild-123'
    // CRITICAL: Mock fetch to prevent real API calls to Discord
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_URL
    delete process.env.DISCORD_GUILD_ID
    vi.unstubAllGlobals()
  })

  it('creates event and team threads for a single team', async () => {
    const mockRace = setupMockRace()
    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(createOrUpdateTeamThread).toHaveBeenCalledTimes(1)
    expect(createOrUpdateTeamThread).toHaveBeenCalledWith(
      expect.objectContaining({
        teamName: 'Team One',
      })
    )

    // Check that createOrUpdateEventThread was called with correct data
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            raceStartTime,
            teams: expect.arrayContaining([
              expect.objectContaining({
                name: 'Team One',
                threadUrl: 'https://discord.com/channels/guild-123/team-thread-1',
              }),
            ]),
          }),
        ]),
      })
    )

    expect(prisma.race.update).toHaveBeenCalledWith({
      where: { id: raceId },
      data: expect.objectContaining({
        discordTeamThreads: { 'team-1': 'team-thread-1' },
      }),
    })
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'event-thread-id' },
    })
  })

  it('creates event thread and two team threads when two teams are assigned', async () => {
    const mockRace = setupMockRace()
    const mockRegistrations = [
      setupMockRegistration('1', 'team-1', 'Team One'),
      setupMockRegistration('2', 'team-2', 'Team Two'),
    ]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)

    vi.mocked(createOrUpdateTeamThread)
      .mockResolvedValueOnce('team-thread-1')
      .mockResolvedValueOnce('team-thread-2')

    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Verify both team threads were created
    expect(createOrUpdateTeamThread).toHaveBeenCalledTimes(2)
    expect(createOrUpdateTeamThread).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ teamName: 'Team One' })
    )
    expect(createOrUpdateTeamThread).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ teamName: 'Team Two' })
    )

    // Verify event notification includes timeslots with both thread links
    const call = vi.mocked(createOrUpdateEventThread).mock.calls[0][0]
    expect(call.timeslots).toHaveLength(1)
    expect(call.timeslots[0].teams).toHaveLength(2)
    expect(call.timeslots[0].teams[0]).toMatchObject({
      name: 'Team One',
      threadUrl: 'https://discord.com/channels/guild-123/team-thread-1',
    })
    expect(call.timeslots[0].teams[1]).toMatchObject({
      name: 'Team Two',
      threadUrl: 'https://discord.com/channels/guild-123/team-thread-2',
    })

    // Verify DB update persists all thread IDs
    expect(prisma.race.update).toHaveBeenCalledWith({
      where: { id: raceId },
      data: expect.objectContaining({
        discordTeamThreads: {
          'team-1': 'team-thread-1',
          'team-2': 'team-thread-2',
        },
      }),
    })
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'event-thread-id' },
    })
  })

  it('recreates missing linked team thread and persists the replacement link', async () => {
    const mockRace = setupMockRace({
      discordTeamThreads: {
        'team-1': 'deleted-thread-id',
      },
    })
    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('replacement-thread-id')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(createOrUpdateTeamThread).toHaveBeenCalledWith(
      expect.objectContaining({
        teamName: 'Team One',
        existingThreadId: 'deleted-thread-id',
      })
    )

    const call = vi.mocked(createOrUpdateEventThread).mock.calls[0][0]
    expect(call.timeslots).toHaveLength(1)
    expect(call.timeslots[0].teams).toHaveLength(1)
    expect(call.timeslots[0].teams[0]).toMatchObject({
      name: 'Team One',
      threadUrl: 'https://discord.com/channels/guild-123/replacement-thread-id',
    })

    expect(prisma.race.update).toHaveBeenCalledWith({
      where: { id: raceId },
      data: expect.objectContaining({
        discordTeamThreads: { 'team-1': 'replacement-thread-id' },
      }),
    })
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'event-thread-id' },
    })
  })

  it('uses event-level discussion thread from another timeslot', async () => {
    const mockRace = setupMockRace({ discordTeamsThreadId: null })
    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'shared-event-thread',
    } as any)
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'shared-event-thread',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'shared-event-thread',
      })
    )
  })
})

describe('registerForRace', () => {
  const mockSession = { user: { id: 'user-1', role: 'USER' } }
  const FIXED_TIME = new Date('2026-02-10T12:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FIXED_TIME)
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.registration.create).mockResolvedValue({ id: 'reg-created' } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      user: {
        name: 'User 1',
        image: null,
        accounts: [{ providerAccountId: 'discord-1' }],
      },
      race: {
        startTime: new Date('2026-02-11T20:00:00Z'),
        event: { id: 'event-123', name: 'GT3' },
      },
      carClass: { name: 'GT3' },
    } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ expectationsVersion: 1 } as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      { id: 'race-123', startTime: new Date('2026-02-11T20:00:00Z'), registrations: [] },
    ] as any)
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      carClasses: [{ name: 'GT3' }],
      customCarClasses: [],
    } as any)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 2 } as any)
    vi.mocked(sendRegistrationNotification).mockResolvedValue(true)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.DISCORD_GUILD_ID = 'test-guild-id'
    // CRITICAL: Mock fetch to prevent real API calls to Discord
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.NEXTAUTH_URL
    delete process.env.DISCORD_GUILD_ID
    vi.unstubAllGlobals()
  })

  it('creates a new event discussion thread when self-registering for first time', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      startTime: new Date('2026-02-11T20:00:00Z'),
      endTime: new Date('2026-02-12T20:00:00Z'),
      eventId: 'event-123',
      discordTeamsThreadId: null,
      maxDriversPerTeam: null,
      teamsAssigned: false,
      teamAssignmentStrategy: 'BALANCED_IRATING',
      event: {
        id: 'event-123',
        name: 'GT3 Challenge',
        track: 'Spa',
        trackConfig: 'Endurance',
        tempValue: 75,
        precipChance: 10,
        carClasses: [{ name: 'GT3' }],
        customCarClasses: [],
      },
    } as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('carClassId', 'class-1')

    const result = await registerForRace({ message: '' }, formData)

    expect(result).toEqual({ message: 'Success' })
    // Should create new thread via sendTeamsAssignedNotification
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        threadId: undefined, // No existing thread
      })
    )
    // Should sync new thread ID to all event races
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'event-thread-id' },
    })
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'event-thread-id',
        guildId: 'test-guild-id',
      })
    )
  })

  it('reuses existing event discussion thread when self-registering', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      startTime: new Date('2026-02-11T20:00:00Z'),
      endTime: new Date('2026-02-12T20:00:00Z'),
      eventId: 'event-123',
      discordTeamsThreadId: 'existing-thread-id',
      maxDriversPerTeam: null,
      teamsAssigned: false,
      teamAssignmentStrategy: 'BALANCED_IRATING',
      event: {
        id: 'event-123',
        name: 'GT3 Challenge',
        track: 'Spa',
        trackConfig: 'Endurance',
        tempValue: 75,
        precipChance: 10,
        carClasses: [{ name: 'GT3' }],
        customCarClasses: [],
      },
    } as any)

    // Another race in the event already has a thread
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'existing-thread-id',
    } as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('carClassId', 'class-1')

    const result = await registerForRace({ message: '' }, formData)

    expect(result).toEqual({ message: 'Success' })
    // Should reuse existing thread via sendTeamsAssignedNotification
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        threadId: 'existing-thread-id',
      })
    )
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'event-thread-id',
        guildId: 'test-guild-id',
      })
    )
  })

  it('includes newly registered driver in event thread as unassigned', async () => {
    // Mock race with existing registrations plus the new one
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      {
        id: 'race-123',
        startTime: new Date('2026-02-11T20:00:00Z'),
        registrations: [
          {
            id: 'reg-existing',
            team: null,
            carClass: { name: 'GT3' },
            user: {
              name: 'Existing Driver',
              accounts: [{ providerAccountId: 'discord-existing' }],
            },
            manualDriver: null,
          },
          {
            id: 'reg-new',
            team: null,
            carClass: { name: 'GT3' },
            user: {
              name: 'User 1',
              accounts: [{ providerAccountId: 'discord-1' }],
            },
            manualDriver: null,
          },
        ],
      },
    ] as any)

    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      startTime: new Date('2026-02-11T20:00:00Z'),
      endTime: new Date('2026-02-12T20:00:00Z'),
      eventId: 'event-123',
      discordTeamsThreadId: null,
      maxDriversPerTeam: null,
      teamsAssigned: false,
      teamAssignmentStrategy: 'BALANCED_IRATING',
      event: {
        id: 'event-123',
        name: 'GT3 Challenge',
        track: 'Spa',
        trackConfig: 'Endurance',
        tempValue: 75,
        precipChance: 10,
        carClasses: [{ name: 'GT3' }],
        customCarClasses: [],
      },
    } as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('carClassId', 'class-1')

    const result = await registerForRace({ message: '' }, formData)

    expect(result).toEqual({ message: 'Success' })
    // Should include both drivers in unassigned list
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        timeslots: [
          expect.objectContaining({
            raceStartTime: new Date('2026-02-11T20:00:00Z'),
            teams: [],
            unassigned: [
              {
                name: 'Existing Driver',
                carClass: 'GT3',
                discordId: 'discord-existing',
                registrationId: 'reg-existing',
              },
              {
                name: 'User 1',
                carClass: 'GT3',
                discordId: 'discord-1',
                registrationId: 'reg-new',
              },
            ],
          }),
        ],
      })
    )
  })
})

describe('adminRegisterDriver', () => {
  const FIXED_TIME = new Date('2026-02-10T12:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(FIXED_TIME)
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      { id: 'race-123', startTime: new Date('2026-02-11T20:00:00Z'), registrations: [] },
    ] as any)
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      carClasses: [{ name: 'GT3' }],
      customCarClasses: [],
    } as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'new-event-thread-id',
    })
    vi.mocked(sendRegistrationNotification).mockResolvedValue(true)
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.DISCORD_GUILD_ID = 'test-guild-id'
    // CRITICAL: Mock fetch to prevent real API calls to Discord
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.NEXTAUTH_URL
    delete process.env.DISCORD_GUILD_ID
    vi.unstubAllGlobals()
  })

  it('refreshes team notification when adding a driver after teams are assigned', async () => {
    vi.mocked(prisma.race.findUnique)
      .mockResolvedValueOnce({
        startTime: new Date('2026-02-11T20:00:00Z'),
        endTime: new Date('2026-02-12T20:00:00Z'),
        eventId: 'event-123',
        maxDriversPerTeam: null,
        teamsAssigned: true,
        teamAssignmentStrategy: 'BALANCED_IRATING',
      } as any)
      .mockResolvedValueOnce({
        id: 'race-123',
        startTime: new Date('2026-02-11T20:00:00Z'),
        discordTeamsThreadId: 'event-thread-id',
        discordTeamsSnapshot: {},
        discordTeamThreads: {},
        event: {
          id: 'event-123',
          name: 'GT3 Challenge',
          track: 'Spa',
          trackConfig: 'Endurance',
          tempValue: 75,
          precipChance: 10,
          carClasses: [{ name: 'GT3' }],
          customCarClasses: [],
        },
      } as any)

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-2' } as any)
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.registration.create).mockResolvedValue({ id: 'reg-created' } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      id: 'reg-created',
      user: { name: 'New Driver', image: null, racerStats: [] },
      carClass: { name: 'GT3', shortName: 'GT3' },
      team: null,
      manualDriver: null,
    } as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-created',
        teamId: null,
        team: null,
        user: {
          name: 'New Driver',
          accounts: [{ providerAccountId: 'discord-2' }],
          racerStats: [],
        },
        manualDriver: null,
        carClass: { name: 'GT3', shortName: 'GT3' },
      },
    ] as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('userId', 'user-2')
    formData.set('carClassId', 'class-1')

    const result = await adminRegisterDriver({ message: '' }, formData)

    expect(result.message).toBe('Success')
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { raceId: 'race-123' },
      })
    )
    expect(createOrUpdateEventThread).toHaveBeenCalled()
  })

  it('creates a new event discussion thread when admin registers first driver', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValueOnce({
      startTime: new Date('2026-02-11T20:00:00Z'),
      endTime: new Date('2026-02-12T20:00:00Z'),
      eventId: 'event-123',
      maxDriversPerTeam: null,
      teamsAssigned: false,
      teamAssignmentStrategy: 'BALANCED_IRATING',
    } as any)

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-2' } as any)
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.registration.create).mockResolvedValue({ id: 'reg-created' } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      id: 'reg-created',
      user: {
        name: 'New Driver',
        image: 'https://example.com/avatar.jpg',
        accounts: [{ providerAccountId: 'discord-123' }],
        racerStats: [],
      },
      race: {
        startTime: new Date('2026-02-11T20:00:00Z'),
        discordTeamsThreadId: null,
        event: {
          id: 'event-123',
          name: 'GT3 Challenge',
          track: 'Spa',
          trackConfig: 'Endurance',
          tempValue: 75,
          precipChance: 10,
        },
      },
      carClass: { name: 'GT3', shortName: 'GT3' },
      team: null,
      manualDriver: null,
    } as any)

    // No existing thread in any race for this event
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('userId', 'user-2')
    formData.set('carClassId', 'class-1')

    const result = await adminRegisterDriver({ message: '' }, formData)

    expect(result.message).toBe('Success')
    // Should create new thread via sendTeamsAssignedNotification
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        threadId: undefined,
      })
    )
    // Should sync new thread ID to all event races
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'new-event-thread-id' },
    })
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: 'New Driver',
        eventName: 'GT3 Challenge',
        threadId: 'new-event-thread-id',
        guildId: 'test-guild-id',
      })
    )
  })

  it('reuses existing event discussion thread when admin registers driver', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValueOnce({
      startTime: new Date('2026-02-11T20:00:00Z'),
      endTime: new Date('2026-02-12T20:00:00Z'),
      eventId: 'event-123',
      maxDriversPerTeam: null,
      teamsAssigned: false,
      teamAssignmentStrategy: 'BALANCED_IRATING',
    } as any)

    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-2' } as any)
    vi.mocked(prisma.registration.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.registration.create).mockResolvedValue({ id: 'reg-created' } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      id: 'reg-created',
      user: {
        name: 'New Driver',
        image: 'https://example.com/avatar.jpg',
        accounts: [{ providerAccountId: 'discord-123' }],
        racerStats: [],
      },
      race: {
        startTime: new Date('2026-02-11T20:00:00Z'),
        discordTeamsThreadId: 'existing-thread-id',
        event: {
          id: 'event-123',
          name: 'GT3 Challenge',
          track: 'Spa',
          trackConfig: 'Endurance',
          tempValue: 75,
          precipChance: 10,
        },
      },
      carClass: { name: 'GT3', shortName: 'GT3' },
      team: null,
      manualDriver: null,
    } as any)

    // Another race in the event already has a thread
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'existing-thread-id',
    } as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('userId', 'user-2')
    formData.set('carClassId', 'class-1')

    const result = await adminRegisterDriver({ message: '' }, formData)

    expect(result.message).toBe('Success')
    // Should reuse existing thread via sendTeamsAssignedNotification
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        threadId: 'existing-thread-id',
      })
    )
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: 'New Driver',
        eventName: 'GT3 Challenge',
        threadId: 'new-event-thread-id',
        guildId: 'test-guild-id',
      })
    )
  })
})

describe('updateRegistrationCarClass', () => {
  it('allows non-admin unassigned users to swap class after teams are assigned', async () => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1', role: 'USER' } } as any)
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-1',
      userId: 'user-1',
      teamId: null,
      raceId: 'race-1',
      race: {
        teamsAssigned: true,
        endTime: new Date('2027-01-01T12:00:00Z'),
        startTime: new Date('2027-01-01T10:00:00Z'),
        eventId: 'event-1',
        maxDriversPerTeam: null,
        teamAssignmentStrategy: 'BALANCED_IRATING',
      },
    } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)

    const formData = new FormData()
    formData.set('registrationId', 'reg-1')
    formData.set('carClassId', 'class-2')

    const result = await updateRegistrationCarClass({ message: '', timestamp: 0 }, formData)

    expect(result.message).toBe('Success')
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { carClassId: 'class-2', teamId: null },
    })
  })
})
