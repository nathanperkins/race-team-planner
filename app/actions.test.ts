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
  createEventDiscussionThread,
  createTeamThread,
  sendRegistrationNotification,
  sendTeamsAssignedNotification as sendDiscordNotification,
} from '@/lib/discord'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    race: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
vi.mock('@/lib/discord', () => ({
  createEventDiscussionThread: vi.fn(),
  createTeamThread: vi.fn(),
  addUsersToThread: vi.fn(),
  buildTeamThreadLink: vi.fn(
    ({ guildId, threadId }: { guildId: string; threadId: string }) =>
      `discord://-/channels/${guildId}/${threadId}`
  ),
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
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.DISCORD_GUILD_ID = 'guild-123'
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_URL
    delete process.env.DISCORD_GUILD_ID
  })

  it('creates event and team threads for a single team', async () => {
    const mockRace = setupMockRace()
    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(sendDiscordNotification).mockResolvedValue({ ok: true, threadId: 'event-thread-id' })

    await sendTeamsAssignmentNotification(raceId)

    expect(createTeamThread).toHaveBeenCalledTimes(1)
    expect(createTeamThread).toHaveBeenCalledWith(
      expect.objectContaining({
        teamName: 'Team One',
      })
    )

    expect(sendDiscordNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            name: 'Team One',
            threadUrl: 'discord://-/channels/guild-123/team-thread-1',
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

    vi.mocked(createTeamThread)
      .mockResolvedValueOnce('team-thread-1')
      .mockResolvedValueOnce('team-thread-2')

    vi.mocked(sendDiscordNotification).mockResolvedValue({ ok: true, threadId: 'event-thread-id' })

    await sendTeamsAssignmentNotification(raceId)

    // Verify both team threads were created
    expect(createTeamThread).toHaveBeenCalledTimes(2)
    expect(createTeamThread).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ teamName: 'Team One' })
    )
    expect(createTeamThread).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ teamName: 'Team Two' })
    )

    // Verify event notification includes both thread links
    expect(sendDiscordNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            name: 'Team One',
            threadUrl: 'discord://-/channels/guild-123/team-thread-1',
          }),
          expect.objectContaining({
            name: 'Team Two',
            threadUrl: 'discord://-/channels/guild-123/team-thread-2',
          }),
        ]),
      })
    )

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
    vi.mocked(createTeamThread).mockResolvedValue('replacement-thread-id')
    vi.mocked(sendDiscordNotification).mockResolvedValue({ ok: true, threadId: 'event-thread-id' })

    await sendTeamsAssignmentNotification(raceId)

    expect(createTeamThread).toHaveBeenCalledWith(
      expect.objectContaining({
        teamName: 'Team One',
        existingThreadId: 'deleted-thread-id',
      })
    )

    expect(sendDiscordNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        teams: expect.arrayContaining([
          expect.objectContaining({
            name: 'Team One',
            threadUrl: 'discord://-/channels/guild-123/replacement-thread-id',
          }),
        ]),
      })
    )

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
    vi.mocked(prisma.race.findFirst).mockResolvedValue({ discordTeamsThreadId: 'shared-event-thread' } as any)
    vi.mocked(createTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(sendDiscordNotification).mockResolvedValue({ ok: true, threadId: 'shared-event-thread' })

    await sendTeamsAssignmentNotification(raceId)

    expect(sendDiscordNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'shared-event-thread',
      })
    )
  })
})

describe('registerForRace', () => {
  const mockSession = { user: { id: 'user-1', role: 'USER' } }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(prisma.registration.create).mockResolvedValue({ id: 'reg-created' } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findFirst).mockResolvedValue({
      user: { name: 'User 1', image: null, accounts: [{ providerAccountId: 'discord-1' }] },
      race: { startTime: new Date('2026-02-11T20:00:00Z'), event: { id: 'event-123', name: 'GT3' } },
      carClass: { name: 'GT3' },
    } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ expectationsVersion: 1 } as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 2 } as any)
    vi.mocked(sendRegistrationNotification).mockResolvedValue(true)
    vi.mocked(createEventDiscussionThread).mockResolvedValue('event-thread-id')
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_URL
  })

  it('creates an event discussion thread on registration and syncs it across event races', async () => {
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
      },
    } as any)

    const formData = new FormData()
    formData.set('raceId', 'race-123')
    formData.set('carClassId', 'class-1')

    const result = await registerForRace({ message: '' }, formData)

    expect(result).toEqual({ message: 'Success' })
    expect(createEventDiscussionThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        existingThreadId: null,
      })
    )
    expect(prisma.race.updateMany).toHaveBeenCalledWith({
      where: { eventId: 'event-123' },
      data: { discordTeamsThreadId: 'event-thread-id' },
    })
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'event-thread-id',
      })
    )
  })
})

describe('adminRegisterDriver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } } as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(sendDiscordNotification).mockResolvedValue({ ok: true, threadId: 'event-thread-id' })
    vi.mocked(createTeamThread).mockResolvedValue('team-thread-1')
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
        user: { name: 'New Driver', accounts: [{ providerAccountId: 'discord-2' }], racerStats: [] },
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
    expect(sendDiscordNotification).toHaveBeenCalled()
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
