import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  adminRegisterDriver,
  deleteRegistration,
  registerForRace,
  saveRaceEdits,
  sendTeamsAssignmentNotification,
  updateRegistrationCarClass,
} from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  createOrUpdateEventThread,
  createOrUpdateTeamThread,
  postRosterChangeNotifications,
  refreshAllTeamThreads,
  sendRegistrationNotification,
  sendTeamsAssignedNotification,
} from '@/lib/discord'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn((promises: any[]) => Promise.all(promises)),
    race: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    registration: {
      create: vi.fn(),
      delete: vi.fn(),
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
      update: vi.fn(),
      create: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
    carClass: {
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
  postRosterChangeNotifications: vi.fn(),
  refreshAllTeamThreads: vi.fn(),
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
        actorName: 'Admin',
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

  it('sends roster change notification when reassigning teams', async () => {
    // First assignment: User 1 on Team One (stored in snapshot)
    const mockRace = setupMockRace({
      discordTeamsThreadId: 'event-thread-id',
      discordTeamsSnapshot: {
        'reg-1': { teamId: 'team-1', driverName: 'User 1' },
      },
      teamsAssigned: true,
    })

    // Second assignment: User 1 moved to Team Two
    const mockRegistrations = [setupMockRegistration('1', 'team-2', 'Team Two')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-id',
    } as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])

    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-2')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Verify event thread was updated
    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'event-thread-id',
      })
    )

    // Verify chat notification was sent with roster changes
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        rosterChanges: expect.arrayContaining([
          expect.objectContaining({
            type: 'moved',
            driverName: 'User 1',
            fromTeam: 'Team One',
            toTeam: 'Team Two',
          }),
        ]),
      }),
      expect.objectContaining({
        title: '🏁 Teams Updated',
      })
    )
  })

  it('detects team car class changes in roster notifications', async () => {
    // First assignment: Team One with Alice and Bob in GT3 class
    const mockRace = setupMockRace({
      teamsAssigned: true,
      discordTeamsThreadId: 'event-thread-id',
      discordTeamsSnapshot: {
        'reg-1': {
          teamId: 'team-1',
          driverName: 'Alice',
          carClassId: 'class-gt3',
          carClassName: 'GT3',
        },
        'reg-2': {
          teamId: 'team-1',
          driverName: 'Bob',
          carClassId: 'class-gt3',
          carClassName: 'GT3',
        },
      },
    })

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)

    // Current state: Same team, but both changed to GTE class
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-1',
        teamId: 'team-1',
        team: { id: 'team-1', name: 'Team One' },
        carClass: { id: 'class-gte', name: 'GTE', shortName: 'GTE' },
        user: { name: 'Alice', accounts: [], racerStats: [] },
        manualDriver: null,
      },
      {
        id: 'reg-2',
        teamId: 'team-1',
        team: { id: 'team-1', name: 'Team One' },
        carClass: { id: 'class-gte', name: 'GTE', shortName: 'GTE' },
        user: { name: 'Bob', accounts: [], racerStats: [] },
        manualDriver: null,
      },
    ] as any)

    vi.mocked(prisma.team.findMany).mockResolvedValue([{ id: 'team-1', name: 'Team One' }] as any)

    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Verify chat notification was sent with team class change
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        rosterChanges: expect.arrayContaining([
          expect.objectContaining({
            type: 'teamClassChanged',
            teamName: 'Team One',
            fromClass: 'GT3',
            toClass: 'GTE',
            drivers: expect.arrayContaining(['Alice', 'Bob']),
          }),
        ]),
      }),
      expect.objectContaining({
        title: '🏁 Teams Updated',
      })
    )
  })

  it('sends notification on first team assignment with "Teams Assigned" title', async () => {
    // First assignment: no previous snapshot
    const mockRace = setupMockRace({
      discordTeamsSnapshot: null, // No previous snapshot
      teamsAssigned: false, // Not yet marked as assigned
    })

    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Verify chat notification was sent with "Teams Assigned" title for first assignment
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.objectContaining({
        eventName: 'GT3 Challenge',
        rosterChanges: undefined,
      }),
      expect.objectContaining({
        title: '🏁 Teams Assigned',
      })
    )
  })

  it('does not send notification when no teams are assigned', async () => {
    // No teams assigned - all registrations are unassigned
    const mockRace = setupMockRace()
    const mockRegistrations = [setupMockRegistration('1', null)] // Unassigned

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Verify no chat notification was sent
    expect(sendTeamsAssignedNotification).not.toHaveBeenCalled()
  })
})

describe('deleteRegistration notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', role: 'USER', name: 'User One' },
    } as any)
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      { id: 'team-1', name: 'Team One' },
      { id: 'team-2', name: 'Team Two' },
    ] as any)
  })

  it('posts drop notification to event and team thread when user drops from team', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-1',
      userId: 'user-1',
      teamId: 'team-1',
      team: { id: 'team-1', name: 'Team One' },
      user: { name: 'User One' },
      manualDriver: null,
      race: {
        id: 'race-1',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: null,
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-1',
      discordTeamThreads: { 'team-1': 'team-thread-1' },
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)

    await deleteRegistration('reg-1')

    expect(postRosterChangeNotifications).toHaveBeenCalledWith(
      'event-thread-1',
      [{ type: 'dropped', driverName: 'User One', fromTeam: 'Team One' }],
      expect.any(String),
      'User One',
      { 'team-1': 'team-thread-1' },
      expect.any(Map)
    )
  })

  it('posts drop notification only to event thread payload with Unassigned source', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-2',
      userId: 'user-1',
      teamId: null,
      team: null,
      user: { name: 'User One' },
      manualDriver: null,
      race: {
        id: 'race-1',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-1',
      discordTeamThreads: {},
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)

    await deleteRegistration('reg-2')

    expect(postRosterChangeNotifications).toHaveBeenCalledWith(
      'event-thread-1',
      [{ type: 'dropped', driverName: 'User One', fromTeam: 'Unassigned' }],
      expect.any(String),
      'User One',
      {},
      expect.any(Map)
    )
  })

  it('updates the main event discussion post when user drops from event', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-3',
      userId: 'user-1',
      teamId: 'team-1',
      team: { id: 'team-1', name: 'Team One', alias: null },
      user: { name: 'User One' },
      manualDriver: null,
      race: {
        id: 'race-1',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-1',
      discordTeamThreads: { 'team-1': 'team-thread-1' },
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      {
        id: 'race-1',
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T12:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
        registrations: [],
        event: {
          id: 'event-1',
          name: 'Test Event',
          track: 'Test Track',
          trackConfig: null,
          tempValue: null,
          precipChance: null,
          carClasses: [{ name: 'GT3' }],
          customCarClasses: [],
        },
      },
    ] as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({ ok: true })
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    await deleteRegistration('reg-3')

    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Test Event',
        threadId: 'event-thread-1',
      })
    )

    delete process.env.NEXTAUTH_URL
  })

  it('updates team discussion posts when user drops from event', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-4',
      userId: 'user-1',
      teamId: 'team-1',
      team: { id: 'team-1', name: 'Team One', alias: null },
      user: { name: 'User One' },
      manualDriver: null,
      race: {
        id: 'race-1',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-1',
      discordTeamThreads: { 'team-1': 'team-thread-1', 'team-2': 'team-thread-2' },
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      {
        id: 'race-1',
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T12:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
        registrations: [
          {
            id: 'reg-other',
            teamId: 'team-1',
            user: {
              name: 'Other Driver',
              image: null,
              accounts: [{ provider: 'discord', providerAccountId: 'discord-2' }],
            },
            manualDriver: null,
            team: {
              id: 'team-1',
              name: 'Team One',
              alias: null,
            },
            carClass: { name: 'GT3' },
          },
        ],
        event: {
          id: 'event-1',
          name: 'Test Event',
          track: 'Test Track',
          trackConfig: null,
          tempValue: null,
          precipChance: null,
          carClasses: [{ name: 'GT3' }],
          customCarClasses: [],
        },
      },
    ] as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({ ok: true })
    vi.mocked(refreshAllTeamThreads).mockResolvedValue(undefined)
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    await deleteRegistration('reg-4')

    expect(refreshAllTeamThreads).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'race-1',
          startTime: new Date('2099-01-01T10:00:00Z'),
          event: expect.objectContaining({
            id: 'event-1',
            name: 'Test Event',
          }),
          teams: expect.arrayContaining([
            expect.objectContaining({
              id: 'team-1',
              name: 'Team One',
            }),
          ]),
        }),
      ]),
      { 'team-1': 'team-thread-1', 'team-2': 'team-thread-2' },
      expect.any(String),
      'http://localhost:3000'
    )

    delete process.env.NEXTAUTH_URL
  })

  it('includes unassigned drivers when updating event thread after drop', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-5',
      userId: 'user-1',
      teamId: null,
      team: null,
      user: { name: 'Alice' },
      manualDriver: null,
      race: {
        id: 'race-1',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-1',
      discordTeamThreads: {},
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([
      {
        id: 'race-1',
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T12:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
        registrations: [
          {
            id: 'reg-unassigned-1',
            teamId: null,
            user: {
              name: 'Bob',
              image: null,
              accounts: [{ provider: 'discord', providerAccountId: 'discord-3' }],
            },
            manualDriver: null,
            team: null,
            carClass: { name: 'GT3' },
          },
          {
            id: 'reg-unassigned-2',
            teamId: null,
            user: {
              name: 'Charlie',
              image: null,
              accounts: [],
            },
            manualDriver: null,
            team: null,
            carClass: { name: 'GTE' },
          },
        ],
        event: {
          id: 'event-1',
          name: 'Test Event',
          track: 'Test Track',
          trackConfig: null,
          tempValue: null,
          precipChance: null,
          carClasses: [{ name: 'GT3' }, { name: 'GTE' }],
          customCarClasses: [],
        },
      },
    ] as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({ ok: true })
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    await deleteRegistration('reg-5')

    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            unassigned: expect.arrayContaining([
              expect.objectContaining({
                name: 'Bob',
                carClass: 'GT3',
                discordId: 'discord-3',
              }),
              expect.objectContaining({
                name: 'Charlie',
                carClass: 'GTE',
              }),
            ]),
          }),
        ]),
      })
    )

    delete process.env.NEXTAUTH_URL
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
    // Should send registration notification for first registration (fixes #94)
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

    vi.mocked(createOrUpdateEventThread).mockResolvedValueOnce({
      ok: true,
      threadId: 'existing-thread-id',
    })

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
        threadId: 'existing-thread-id',
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
      user: {
        name: 'New Driver',
        image: null,
        accounts: [{ providerAccountId: 'discord-2' }],
        racerStats: [],
      },
      carClass: { name: 'GT3', shortName: 'GT3' },
      team: null,
      manualDriver: null,
      race: {
        startTime: new Date('2026-02-11T20:00:00Z'),
        discordTeamsThreadId: 'event-thread-id',
        event: {
          id: 'event-123',
          name: 'GT3 Challenge',
          track: 'Spa',
          trackConfig: 'Endurance',
          tempValue: 75,
          precipChance: 10,
        },
      },
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
    // Should send registration notification for first registration (fixes #94)
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({
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

    vi.mocked(createOrUpdateEventThread).mockResolvedValueOnce({
      ok: true,
      threadId: 'existing-thread-id',
    })

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
        threadId: 'existing-thread-id',
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
      carClass: {
        id: 'class-1',
        name: 'Old Class',
      },
    } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: 'race-1',
      discordTeamsThreadId: 'thread-1',
    } as any)
    vi.mocked(prisma.carClass.findUnique).mockResolvedValue({
      id: 'class-2',
      name: 'New Class',
    } as any)

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

describe('saveRaceEdits - Discord thread validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prevents renaming team when Discord thread exists', async () => {
    const mockSession = {
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    vi.mocked(auth).mockResolvedValue(mockSession)

    // Mock race with Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: 'race-1',
      startTime: new Date('2026-03-01T20:00:00Z'),
      endTime: new Date('2026-03-01T22:00:00Z'),
      eventId: 'event-1',
      maxDriversPerTeam: 3,
      teamsAssigned: true,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // team-1 has a thread
    } as any)

    // Mock existing teams
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      {
        id: 'team-1',
        name: 'Original Team Name',
        iracingTeamId: 1001,
      },
    ] as any)

    vi.mocked(prisma.registration.findMany).mockResolvedValue([])
    vi.mocked(prisma.registration.findFirst).mockResolvedValue(null)

    const formData = new FormData()
    formData.set('raceId', 'race-1')
    formData.set('maxDriversPerTeam', '3')
    formData.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    formData.set('applyRebalance', 'false')
    formData.set('registrationUpdates', '[]')
    formData.set('newTeams', '[]')
    formData.set('pendingAdditions', '[]')
    formData.set('pendingDrops', '[]')
    formData.set('teamNameOverrides', JSON.stringify({ 'team-1': 'New Team Name' }))

    const result = await saveRaceEdits(formData)

    expect(result.message).toBe(
      'Cannot rename team: Discord thread already exists for this team. Team names are immutable after thread creation to prevent confusion.'
    )
    expect(prisma.team.update).not.toHaveBeenCalled()
  })

  it('allows moving drivers between teams even when source team has Discord thread', async () => {
    const mockSession = {
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    vi.mocked(auth).mockResolvedValue(mockSession)

    // Mock race with Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: 'race-1',
      startTime: new Date('2026-03-01T20:00:00Z'),
      endTime: new Date('2026-03-01T22:00:00Z'),
      eventId: 'event-1',
      maxDriversPerTeam: 3,
      teamsAssigned: true,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // team-1 has thread
    } as any)

    // Mock existing registration with team-1 assigned
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-1',
        userId: 'user-1',
        raceId: 'race-1',
        teamId: 'team-1', // Current team (has thread)
      },
    ] as any)

    vi.mocked(prisma.registration.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)

    const formData = new FormData()
    formData.set('raceId', 'race-1')
    formData.set('maxDriversPerTeam', '3')
    formData.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    formData.set('applyRebalance', 'false')
    formData.set(
      'registrationUpdates',
      JSON.stringify([
        {
          id: 'reg-1',
          carClassId: 'class-1',
          teamId: 'team-2', // Moving to team-2 (allowed - drivers can move between teams)
        },
      ])
    )
    formData.set('newTeams', '[]')
    formData.set('pendingAdditions', '[]')
    formData.set('pendingDrops', '[]')
    formData.set('teamNameOverrides', '{}')

    await saveRaceEdits(formData)

    // Should allow the update - drivers can move between teams
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        carClassId: 'class-1',
        teamId: 'team-2',
      },
    })
  })

  it('allows keeping the same team assignment when thread exists', async () => {
    const mockSession = {
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    vi.mocked(auth).mockResolvedValue(mockSession)

    // Mock race with Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: 'race-1',
      startTime: new Date('2026-03-01T20:00:00Z'),
      endTime: new Date('2026-03-01T22:00:00Z'),
      eventId: 'event-1',
      maxDriversPerTeam: 3,
      teamsAssigned: true,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // team-1 has a thread
    } as any)

    // Mock existing registration with team-1 assigned
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-1',
        userId: 'user-1',
        raceId: 'race-1',
        teamId: 'team-1', // Current team
      },
    ] as any)

    vi.mocked(prisma.registration.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)

    const formData = new FormData()
    formData.set('raceId', 'race-1')
    formData.set('maxDriversPerTeam', '3')
    formData.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    formData.set('applyRebalance', 'false')
    formData.set(
      'registrationUpdates',
      JSON.stringify([
        {
          id: 'reg-1',
          carClassId: 'class-1',
          teamId: 'team-1', // Keeping same team (allowed)
        },
      ])
    )
    formData.set('newTeams', '[]')
    formData.set('pendingAdditions', '[]')
    formData.set('pendingDrops', '[]')
    formData.set('teamNameOverrides', '{}')

    await saveRaceEdits(formData)

    // Should allow the update
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        carClassId: 'class-1',
        teamId: 'team-1',
      },
    })
  })

  it('allows removing driver from team (to unassigned) even when thread exists', async () => {
    const mockSession = {
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    vi.mocked(auth).mockResolvedValue(mockSession)

    // Mock race with Discord threads
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: 'race-1',
      startTime: new Date('2026-03-01T20:00:00Z'),
      endTime: new Date('2026-03-01T22:00:00Z'),
      eventId: 'event-1',
      maxDriversPerTeam: 3,
      teamsAssigned: true,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: { 'team-1': 'thread-123' }, // team-1 has a thread
    } as any)

    // Mock existing registration with team-1 assigned
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-1',
        userId: 'user-1',
        raceId: 'race-1',
        teamId: 'team-1', // Current team (has thread)
      },
    ] as any)

    vi.mocked(prisma.registration.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)

    const formData = new FormData()
    formData.set('raceId', 'race-1')
    formData.set('maxDriversPerTeam', '3')
    formData.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    formData.set('applyRebalance', 'false')
    formData.set(
      'registrationUpdates',
      JSON.stringify([
        {
          id: 'reg-1',
          carClassId: 'class-1',
          teamId: null, // Removing from team (should be allowed)
        },
      ])
    )
    formData.set('newTeams', '[]')
    formData.set('pendingAdditions', '[]')
    formData.set('pendingDrops', '[]')
    formData.set('teamNameOverrides', '{}')

    const result = await saveRaceEdits(formData)

    // Should allow the update (removing from team is always allowed)
    expect(result.message).not.toBe(
      'Cannot change team assignment: Discord thread already exists for this team'
    )
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        carClassId: 'class-1',
        teamId: null,
      },
    })
  })
})
