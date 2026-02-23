import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  adminRegisterDriver,
  deleteRegistration,
  loadRaceAssignmentData,
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
      createMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    manualDriver: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    event: {
      findUnique: vi.fn(),
    },
    carClass: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
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

  it('includes unassigned drivers in the event thread notification', async () => {
    const mockRace = setupMockRace({ teamsAssigned: true })
    const unassignedDriver = setupMockRegistration('unassigned', null)
    const assignedDriver = setupMockRegistration('assigned', 'team-1', 'Team One')

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    // Simulate DB filter: return nothing when teamId filter is applied, full list otherwise.
    // This makes the test fail when the bug is present and pass when it is fixed.
    vi.mocked(prisma.registration.findMany).mockImplementation(async (query: any) => {
      if (query?.where?.teamId) return []
      return [assignedDriver, unassignedDriver] as any
    })
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            unassigned: expect.arrayContaining([
              expect.objectContaining({ name: 'User unassigned' }),
            ]),
          }),
        ]),
      })
    )
  })

  it('includes sibling race timeslots with assigned teams and unassigned drivers (regression for #129)', async () => {
    // Regression test for GitHub issue #129:
    // "When event thread is updated with teams in one timeslot, all other timeslots get cleared"
    //
    // The bugs were:
    // 1. Sibling registrations were loaded with a `teamId: { not: null }` filter, which excluded
    //    unassigned drivers from appearing in sibling timeslots.
    // 2. Sibling races were loaded with a `teamsAssigned: true` filter, which excluded races not
    //    yet assigned as timeslots (covered separately by the 'includes an empty timeslot' test).
    const race10AMId = 'race-10am'
    const race6AMId = 'race-6am'
    const race11PMStartTime = new Date('2026-02-12T23:00:00Z')
    const race10AMStartTime = new Date('2026-02-12T10:00:00Z')
    const race6AMStartTime = new Date('2026-02-12T06:00:00Z')

    // Current race (11PM) - first time assigning teams
    const mockRace = setupMockRace({
      startTime: race11PMStartTime,
      teamsAssigned: false,
      discordTeamsSnapshot: null,
    })

    // Sibling races (10AM and 6AM) already have teams assigned with actual drivers
    const sibling10AM = {
      id: race10AMId,
      startTime: race10AMStartTime,
      teamsAssigned: true,
      discordTeamThreads: { 'team-alpha': 'thread-alpha' },
    }
    const sibling6AM = {
      id: race6AMId,
      startTime: race6AMStartTime,
      teamsAssigned: true,
      discordTeamThreads: { 'team-beta': 'thread-beta' },
    }

    // 11PM: Cobalt team with Alice
    const reg11PM = {
      id: 'reg-11pm-1',
      raceId: raceId,
      teamId: 'team-cobalt',
      team: { id: 'team-cobalt', name: 'Cobalt', alias: null },
      carClassId: 'class-gt3',
      carClass: { id: 'class-gt3', name: 'GT3', shortName: 'GT3' },
      userId: 'user-alice',
      manualDriverId: null,
      user: { name: 'Alice', accounts: [], racerStats: [] },
      manualDriver: null,
    }

    // 10AM: Alpha team with Bob (GT3, assigned) + Carol (LMP2, UNASSIGNED)
    // Carol tests bug fix #1: unassigned drivers must not be filtered from sibling registrations
    const reg10AMAssigned = {
      id: 'reg-10am-1',
      raceId: race10AMId,
      teamId: 'team-alpha',
      team: { id: 'team-alpha', name: 'Alpha', alias: null },
      carClassId: 'class-gt3',
      carClass: { id: 'class-gt3', name: 'GT3', shortName: 'GT3' },
      userId: 'user-bob',
      manualDriverId: null,
      user: { name: 'Bob', accounts: [], racerStats: [] },
      manualDriver: null,
    }
    const reg10AMUnassigned = {
      id: 'reg-10am-2',
      raceId: race10AMId,
      teamId: null, // unassigned driver
      team: null,
      carClassId: 'class-lmp2',
      carClass: { id: 'class-lmp2', name: 'LMP2', shortName: 'LMP2' },
      userId: 'user-carol',
      manualDriverId: null,
      user: { name: 'Carol', accounts: [], racerStats: [] },
      manualDriver: null,
    }

    // 6AM: Beta team with Dave
    const reg6AM = {
      id: 'reg-6am-1',
      raceId: race6AMId,
      teamId: 'team-beta',
      team: { id: 'team-beta', name: 'Beta', alias: null },
      carClassId: 'class-gt3',
      carClass: { id: 'class-gt3', name: 'GT3', shortName: 'GT3' },
      userId: 'user-dave',
      manualDriverId: null,
      user: { name: 'Dave', accounts: [], racerStats: [] },
      manualDriver: null,
    }

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([sibling10AM, sibling6AM] as any)
    // First findMany call: current race (11PM) registrations
    // Second findMany call: sibling registrations — includes Carol (unassigned) to test bug fix
    vi.mocked(prisma.registration.findMany)
      .mockResolvedValueOnce([reg11PM] as any)
      .mockResolvedValueOnce([reg10AMAssigned, reg10AMUnassigned, reg6AM] as any)

    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('cobalt-thread')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    const call = vi.mocked(createOrUpdateEventThread).mock.calls[0]![0]!

    // All 3 timeslots must be present
    expect(call.timeslots).toHaveLength(3)

    const timeslot10AM = call.timeslots.find(
      (t) => t.raceStartTime.getTime() === race10AMStartTime.getTime()
    )
    const timeslot6AM = call.timeslots.find(
      (t) => t.raceStartTime.getTime() === race6AMStartTime.getTime()
    )

    // 10AM: assigned team must be present
    expect(timeslot10AM).toBeDefined()
    expect(timeslot10AM?.teams).toHaveLength(1)
    expect(timeslot10AM?.teams[0]).toMatchObject({ name: 'Alpha' })
    // 10AM: unassigned driver Carol must also appear (was missing before bug fix)
    expect(timeslot10AM?.unassigned).toHaveLength(1)
    expect(timeslot10AM?.unassigned?.[0]).toMatchObject({ name: 'Carol' })

    // 6AM: assigned team must be present
    expect(timeslot6AM).toBeDefined()
    expect(timeslot6AM?.teams).toHaveLength(1)
    expect(timeslot6AM?.teams[0]).toMatchObject({ name: 'Beta' })
  })

  it('includes an empty timeslot for sibling races that have not yet had teams assigned', async () => {
    const siblingStartTime = new Date('2026-02-12T20:00:00Z') // a second timeslot
    const mockRace = setupMockRace({ teamsAssigned: true })
    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      setupMockRegistration('1', 'team-1', 'Team One'),
    ] as any)
    // Simulate DB filter: when teamsAssigned:true is applied, the unassigned sibling is
    // excluded. Without the filter it is returned, enabling the empty-timeslot branch.
    vi.mocked(prisma.race.findMany).mockImplementation(async (query: any) => {
      if (query?.where?.teamsAssigned === true) return []
      return [
        {
          id: 'sibling-race-1',
          startTime: siblingStartTime,
          teamsAssigned: false,
          discordTeamThreads: null,
        },
      ] as any
    })
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(createOrUpdateEventThread).toHaveBeenCalledWith(
      expect.objectContaining({
        timeslots: expect.arrayContaining([
          expect.objectContaining({
            raceStartTime: siblingStartTime,
            teams: [],
          }),
        ]),
      })
    )
  })

  it('sends Teams Assigned notification on first save even when all drivers are unassigned', async () => {
    // No teams assigned - all registrations are unassigned, but it IS the first save
    const mockRace = setupMockRace() // discordTeamsSnapshot: null → isFirstAssignment=true
    const mockRegistrations = [setupMockRegistration('1', null)] // Unassigned

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Notification fires for first-save-with-registrations (issue #133 fix)
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.anything(),
      expect.objectContaining({ title: '🏁 Teams Assigned' })
    )
  })

  it('does not send notification when re-saving with no roster changes (scenario 3)', async () => {
    // Previous state: User 1 on Team One — same as current state (no changes)
    const mockRace = setupMockRace({
      teamsAssigned: true,
      discordTeamsThreadId: 'event-thread-id',
      discordTeamThreads: { 'team-1': 'team-thread-1' },
      discordTeamsSnapshot: {
        'reg-1': { teamId: 'team-1', driverName: 'User 1', carClassName: 'GT3' },
      },
    })

    // Current state: identical to snapshot — no changes
    const mockRegistrations = [setupMockRegistration('1', 'team-1', 'Team One')]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-id',
    } as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
    vi.mocked(createOrUpdateTeamThread).mockResolvedValue('team-thread-1')
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    expect(sendTeamsAssignedNotification).not.toHaveBeenCalled()
  })

  // Regression test for GitHub issue #133:
  // No notification was sent when a new driver was added as unassigned on the first save,
  // because the condition required hasTeamsAssigned=true on first assignment.
  it('sends notification on first save when driver is added as unassigned (issue #133)', async () => {
    // No previous snapshot — this is the first save for this race
    const mockRace = setupMockRace({
      discordTeamsSnapshot: null,
      discordTeamsThreadId: null,
    })

    // Driver is registered but unassigned (teamId: null)
    const mockRegistrations = [setupMockRegistration('1', null)]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Notification must fire even when no teams are assigned — first save with registrations
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.anything(),
      expect.objectContaining({ title: '🏁 Teams Assigned' })
    )
  })

  // Regression test for GitHub issue #132:
  // Drop notifications were not sent when all members were removed from teams,
  // because the notification was gated on hasTeamsAssigned (teamsList.length > 0).
  it('sends drop notifications when all members are removed from teams (issue #132)', async () => {
    // Previous state: User 1 was on Team One
    const mockRace = setupMockRace({
      teamsAssigned: true,
      discordTeamsThreadId: 'event-thread-id',
      discordTeamThreads: { 'team-1': 'team-thread-1' },
      discordTeamsSnapshot: {
        'reg-1': { teamId: 'team-1', driverName: 'User 1', carClassName: 'GT3' },
      },
    })

    // Current state: User 1 is now unassigned (no teams have any members)
    const mockRegistrations = [setupMockRegistration('1', null)]

    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue(mockRegistrations as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-id',
    } as any)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-id',
    })

    await sendTeamsAssignmentNotification(raceId)

    // Drop notifications must be sent even when teamsList is empty after the update
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-id',
      expect.objectContaining({
        rosterChanges: expect.arrayContaining([
          expect.objectContaining({
            type: 'dropped',
            driverName: 'User 1',
            fromTeam: 'Team One',
          }),
        ]),
      }),
      expect.objectContaining({
        title: '🏁 Teams Updated',
      })
    )
  })
})

describe('loadRaceAssignmentData', () => {
  const raceId = 'race-123'

  const mockRace = {
    id: raceId,
    startTime: new Date('2024-05-01T20:00:00Z'),
    teamsAssigned: false,
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
  }

  const makeSibling = (id: string, teamsAssigned: boolean, startTime = new Date()) => ({
    id,
    startTime,
    discordTeamThreads: null,
    teamsAssigned,
  })

  const makeReg = (id: string, siblingRaceId: string) => ({
    id: `reg-${id}`,
    raceId: siblingRaceId,
    teamId: null,
    carClassId: 'class-1',
    userId: `user-${id}`,
    manualDriverId: null,
    team: null,
    carClass: { id: 'class-1', name: 'GT3', shortName: 'GT3' },
    user: { name: `User ${id}`, accounts: [], racerStats: [] },
    manualDriver: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([])
    vi.mocked(prisma.team.findMany).mockResolvedValue([])
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
  })

  it('throws when race is not found', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValue(null)
    await expect(loadRaceAssignmentData(raceId)).rejects.toThrow('Race not found')
  })

  it('throws when race has no event', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValue({ ...mockRace, event: null } as any)
    await expect(loadRaceAssignmentData(raceId)).rejects.toThrow('Race not found')
  })

  it('returns correctly structured data when no siblings exist', async () => {
    const result = await loadRaceAssignmentData(raceId)
    expect(result.raceWithEvent.id).toBe(raceId)
    expect(result.raceWithEvent.event.id).toBe('event-123')
    expect(result.registrations).toEqual([])
    expect(result.allTeams).toEqual([])
    expect(result.existingEventThreadRecord).toBeNull()
    expect(result.siblingRaces).toEqual([])
    expect(result.siblingRaceRegistrations).toEqual([])
  })

  it('only queries registrations for sibling races that have teams assigned', async () => {
    const assigned = makeSibling('sibling-assigned', true)
    const unassigned = makeSibling('sibling-unassigned', false)
    vi.mocked(prisma.race.findMany).mockResolvedValue([assigned, unassigned] as any)

    await loadRaceAssignmentData(raceId)

    // First findMany is for current race registrations (inside Promise.all),
    // second is for sibling registrations
    expect(prisma.registration.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.registration.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { raceId: { in: ['sibling-assigned'] } },
      })
    )
  })

  it('groups sibling registrations by raceId matching siblingRaces order', async () => {
    const sibling1 = makeSibling('sibling-1', true, new Date('2024-05-01'))
    const sibling2 = makeSibling('sibling-2', true, new Date('2024-06-01'))
    vi.mocked(prisma.race.findMany).mockResolvedValue([sibling1, sibling2] as any)

    const siblingRegs = [
      makeReg('a', 'sibling-1'),
      makeReg('b', 'sibling-2'),
      makeReg('c', 'sibling-1'),
    ]
    vi.mocked(prisma.registration.findMany)
      .mockResolvedValueOnce([]) // current race registrations
      .mockResolvedValueOnce(siblingRegs as any) // sibling registrations

    const result = await loadRaceAssignmentData(raceId)

    expect(result.siblingRaceRegistrations).toHaveLength(2)
    expect(result.siblingRaceRegistrations[0].raceId).toBe('sibling-1')
    expect(result.siblingRaceRegistrations[0].registrations).toHaveLength(2)
    expect(result.siblingRaceRegistrations[1].raceId).toBe('sibling-2')
    expect(result.siblingRaceRegistrations[1].registrations).toHaveLength(1)
  })

  it('excludes unassigned sibling races from siblingRaceRegistrations', async () => {
    const assigned = makeSibling('sibling-assigned', true)
    const unassigned = makeSibling('sibling-unassigned', false)
    vi.mocked(prisma.race.findMany).mockResolvedValue([assigned, unassigned] as any)

    vi.mocked(prisma.registration.findMany)
      .mockResolvedValueOnce([]) // current race
      .mockResolvedValueOnce([makeReg('a', 'sibling-assigned')] as any) // siblings

    const result = await loadRaceAssignmentData(raceId)

    // Only the assigned sibling appears in siblingRaceRegistrations
    expect(result.siblingRaceRegistrations).toHaveLength(1)
    expect(result.siblingRaceRegistrations[0].raceId).toBe('sibling-assigned')
    // The unassigned sibling is still present in siblingRaces (for empty timeslot rendering)
    expect(result.siblingRaces).toHaveLength(2)
  })

  it('returns existingEventThreadRecord when another race in the event has a thread', async () => {
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'existing-thread-999',
    } as any)

    const result = await loadRaceAssignmentData(raceId)

    expect(result.existingEventThreadRecord?.discordTeamsThreadId).toBe('existing-thread-999')
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

  it('sends notification when the dropped race has no thread but a sibling race in the event does', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-cross',
      userId: 'user-1',
      teamId: 'team-1',
      team: { id: 'team-1', name: 'Team One' },
      user: { name: 'User One' },
      manualDriver: null,
      race: {
        id: 'race-2',
        endTime: new Date('2099-01-01T00:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: null, // this race has no thread
        discordTeamThreads: null,
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(prisma.race.findFirst).mockResolvedValue({
      discordTeamsThreadId: 'event-thread-from-race-1',
      discordTeamThreads: { 'team-1': 'team-thread-1' },
    } as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)

    await deleteRegistration('reg-cross')

    expect(postRosterChangeNotifications).toHaveBeenCalledWith(
      'event-thread-from-race-1',
      [{ type: 'dropped', driverName: 'User One', fromTeam: 'Team One' }],
      expect.any(String),
      'User One',
      { 'team-1': 'team-thread-1' },
      expect.any(Map)
    )
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
        discordTeamsThreadId: 'event-thread-1',
        discordTeamThreads: { 'team-1': 'team-thread-1' },
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
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
        discordTeamThreads: { 'team-1': 'team-thread-1' },
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
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
        discordTeamThreads: { 'team-1': 'team-thread-1', 'team-2': 'team-thread-2' },
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
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

  it('passes each race only its own teams to refreshAllTeamThreads for multi-race events', async () => {
    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-6',
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
        discordTeamThreads: { 'team-1': 'team-thread-1', 'team-2': 'team-thread-2' },
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockResolvedValue({} as any)
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)

    const sharedEvent = {
      id: 'event-1',
      name: 'Test Event',
      track: 'Test Track',
      trackConfig: null,
      tempValue: null,
      precipChance: null,
      carClasses: [{ name: 'GT3' }],
      customCarClasses: [],
    }

    vi.mocked(prisma.race.findMany).mockResolvedValue([
      {
        id: 'race-1',
        startTime: new Date('2099-01-01T10:00:00Z'),
        endTime: new Date('2099-01-01T14:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: 'event-thread-1',
        registrations: [
          {
            id: 'reg-other-1',
            teamId: 'team-1',
            user: { name: 'Driver A', image: null, accounts: [] },
            manualDriver: null,
            team: { id: 'team-1', name: 'Team One', alias: null },
            carClass: { name: 'GT3' },
          },
        ],
        event: sharedEvent,
      },
      {
        id: 'race-2',
        startTime: new Date('2099-01-02T10:00:00Z'),
        endTime: new Date('2099-01-02T14:00:00Z'),
        eventId: 'event-1',
        discordTeamsThreadId: null,
        registrations: [
          {
            id: 'reg-other-2',
            teamId: 'team-2',
            user: { name: 'Driver B', image: null, accounts: [] },
            manualDriver: null,
            team: { id: 'team-2', name: 'Team Two', alias: null },
            carClass: { name: 'GT3' },
          },
        ],
        event: sharedEvent,
      },
    ] as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({ ok: true })
    vi.mocked(refreshAllTeamThreads).mockResolvedValue(undefined)
    process.env.NEXTAUTH_URL = 'http://localhost:3000'

    await deleteRegistration('reg-6')

    const callArgs = vi.mocked(refreshAllTeamThreads).mock.calls[0][0]
    const race1Result = callArgs.find((r: any) => r.id === 'race-1')
    const race2Result = callArgs.find((r: any) => r.id === 'race-2')

    // race-1 should only have team-1
    expect(race1Result.teams).toHaveLength(1)
    expect(race1Result.teams[0].id).toBe('team-1')

    // race-2 should only have team-2 (not team-1 bleeding over due to shared teamMap)
    expect(race2Result.teams).toHaveLength(1)
    expect(race2Result.teams[0].id).toBe('team-2')

    delete process.env.NEXTAUTH_URL
  })

  it('only fetches races for thread update after the registration is deleted', async () => {
    let deleteCompleted = false
    let findManyCalledBeforeDelete = false

    vi.mocked(prisma.registration.findUnique).mockResolvedValue({
      id: 'reg-7',
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
        discordTeamThreads: { 'team-1': 'team-thread-1' },
      },
    } as any)
    vi.mocked(prisma.registration.delete).mockImplementation(async () => {
      // Simulate async delete that takes a moment
      await new Promise((resolve) => setTimeout(resolve, 10))
      deleteCompleted = true
      return {} as any
    })
    vi.mocked(postRosterChangeNotifications).mockResolvedValue(undefined as any)
    vi.mocked(prisma.race.findMany).mockImplementation(() => {
      if (!deleteCompleted) findManyCalledBeforeDelete = true
      return Promise.resolve([
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
            track: null,
            trackConfig: null,
            tempValue: null,
            precipChance: null,
            carClasses: [],
            customCarClasses: [],
          },
        },
      ]) as any
    })
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({ ok: true })
    vi.mocked(refreshAllTeamThreads).mockResolvedValue(undefined)

    await deleteRegistration('reg-7')

    expect(findManyCalledBeforeDelete).toBe(false)
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
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      expectationsVersion: 1,
      name: 'User 1',
      image: null,
      accounts: [{ provider: 'discord', providerAccountId: 'discord-1' }],
    } as any)
    vi.mocked(prisma.carClass.findUniqueOrThrow).mockResolvedValue({ name: 'GT3' } as any)
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

// Regression test for df3 investigation:
// The teamsAssigned gate in updateRaceSettings blocked createOrUpdateEventThread
// from being called when a race had only unassigned drivers (teamsAssigned=false).
// The gate was removed so the event thread is always created/updated on team picker save.
describe('saveRaceEdits - event thread for unassigned-only races', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
    process.env.DISCORD_GUILD_ID = 'guild-123'
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_URL
    delete process.env.DISCORD_GUILD_ID
  })

  it('creates event thread even when all drivers are unassigned (teamsAssigned=false)', async () => {
    const adminSession = {
      user: { id: 'admin-1', role: 'ADMIN' },
      expires: '2099-12-31T23:59:59.999Z',
    }
    vi.mocked(auth).mockResolvedValue(adminSession as any)

    const raceWithEvent = {
      id: 'race-1',
      startTime: new Date('2099-03-01T20:00:00Z'),
      endTime: new Date('2099-03-01T22:00:00Z'),
      eventId: 'event-1',
      maxDriversPerTeam: null,
      teamsAssigned: false,
      discordTeamsThreadId: null,
      discordTeamsSnapshot: null,
      discordTeamThreads: null,
      event: {
        id: 'event-1',
        name: 'GT3 Challenge',
        track: 'Spa',
        trackConfig: null,
        tempValue: null,
        precipChance: null,
        carClasses: [{ name: 'GT3' }],
        customCarClasses: [],
      },
    }

    // Both saveRaceEdits and loadRaceAssignmentData call race.findUnique
    vi.mocked(prisma.race.findUnique).mockResolvedValue(raceWithEvent as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      {
        id: 'reg-1',
        userId: 'user-1',
        teamId: null,
        team: null,
        carClass: { id: 'class-1', name: 'GT3', shortName: 'GT3' },
        user: {
          name: 'User 1',
          accounts: [{ providerAccountId: 'discord-1' }],
          racerStats: [],
        },
        manualDriver: null,
        manualDriverId: null,
      },
    ] as any)
    vi.mocked(prisma.team.findMany).mockResolvedValue([])
    vi.mocked(prisma.race.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.race.findMany).mockResolvedValue([])
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)
    vi.mocked(prisma.race.updateMany).mockResolvedValue({ count: 1 } as any)
    vi.mocked(createOrUpdateEventThread).mockResolvedValue({
      ok: true,
      threadId: 'event-thread-1',
    })

    const fd = new FormData()
    fd.set('raceId', 'race-1')
    fd.set('maxDriversPerTeam', '')
    fd.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    fd.set('applyRebalance', 'false')
    fd.set('registrationUpdates', '[]')
    fd.set('newTeams', '[]')
    fd.set('pendingAdditions', '[]')
    fd.set('pendingDrops', '[]')
    fd.set('teamNameOverrides', '{}')

    const result = await saveRaceEdits(fd)

    expect(result.message).toBe('Success')
    // Event thread must be created even when no teams are assigned
    expect(createOrUpdateEventThread).toHaveBeenCalled()
    // Chat notification fires for first-save-with-registrations (issue #133 fix)
    expect(sendTeamsAssignedNotification).toHaveBeenCalledWith(
      'event-thread-1',
      expect.anything(),
      expect.objectContaining({ title: '🏁 Teams Assigned' })
    )
  })
})

describe('saveRaceEdits - registration operations', () => {
  const adminSession = {
    user: { id: 'admin-1', role: 'ADMIN' },
    expires: '2099-12-31T23:59:59.999Z',
  }

  const mockRace = {
    id: 'race-1',
    startTime: new Date('2099-03-01T20:00:00Z'),
    endTime: new Date('2099-03-01T22:00:00Z'),
    eventId: 'event-1',
    maxDriversPerTeam: null,
    teamsAssigned: false,
    discordTeamsThreadId: null,
    discordTeamsSnapshot: null,
    discordTeamThreads: null,
  }

  const baseFormData = () => {
    const fd = new FormData()
    fd.set('raceId', 'race-1')
    fd.set('maxDriversPerTeam', '')
    fd.set('teamAssignmentStrategy', 'BALANCED_IRATING')
    fd.set('applyRebalance', 'false')
    fd.set('registrationUpdates', '[]')
    fd.set('newTeams', '[]')
    fd.set('pendingAdditions', '[]')
    fd.set('pendingDrops', '[]')
    fd.set('teamNameOverrides', '{}')
    return fd
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(adminSession as any)
    vi.mocked(prisma.race.findUnique).mockResolvedValue(mockRace as any)
    vi.mocked(prisma.race.update).mockResolvedValue({} as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([])
    vi.mocked(prisma.registration.deleteMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.registration.createMany).mockResolvedValue({ count: 0 } as any)
    vi.mocked(prisma.registration.update).mockResolvedValue({} as any)
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    vi.mocked(prisma.manualDriver.findMany).mockResolvedValue([])
  })

  it('uses deleteMany with raceId filter for pending drops instead of individual deletes', async () => {
    const fd = baseFormData()
    fd.set('pendingDrops', JSON.stringify(['reg-1', 'reg-2']))

    const result = await saveRaceEdits(fd)

    expect(result.message).toBe('Success')
    expect(prisma.registration.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['reg-1', 'reg-2'] }, raceId: 'race-1' },
    })
    expect(prisma.registration.delete).not.toHaveBeenCalled()
  })

  it('uses createMany for new user additions instead of individual creates', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1' }] as any)

    const fd = baseFormData()
    fd.set(
      'pendingAdditions',
      JSON.stringify([{ userId: 'user-1', carClassId: 'class-1', teamId: 'team-1' }])
    )

    const result = await saveRaceEdits(fd)

    expect(result.message).toBe('Success')
    expect(prisma.registration.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', raceId: 'race-1', carClassId: 'class-1', teamId: 'team-1' }],
    })
    expect(prisma.registration.create).not.toHaveBeenCalled()
  })

  it('batches multiple new additions into a single createMany call', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }] as any)

    const fd = baseFormData()
    fd.set(
      'pendingAdditions',
      JSON.stringify([
        { userId: 'user-1', carClassId: 'class-1', teamId: 'team-1' },
        { userId: 'user-2', carClassId: 'class-1', teamId: 'team-1' },
      ])
    )

    await saveRaceEdits(fd)

    expect(prisma.registration.createMany).toHaveBeenCalledTimes(1)
    expect(prisma.registration.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', raceId: 'race-1', carClassId: 'class-1', teamId: 'team-1' },
        { userId: 'user-2', raceId: 'race-1', carClassId: 'class-1', teamId: 'team-1' },
      ],
    })
  })

  it('updates existing registration when adding a driver already registered for the race', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'user-1' }] as any)
    // user-1 already has 'reg-existing' in this race
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      { id: 'reg-existing', userId: 'user-1', raceId: 'race-1' },
    ] as any)

    const fd = baseFormData()
    fd.set(
      'pendingAdditions',
      JSON.stringify([{ userId: 'user-1', carClassId: 'class-2', teamId: 'team-1' }])
    )

    const result = await saveRaceEdits(fd)

    expect(result.message).toBe('Success')
    expect(prisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-existing' },
      data: { carClassId: 'class-2', teamId: 'team-1' },
    })
    expect(prisma.registration.createMany).not.toHaveBeenCalled()
  })

  it('skips race settings update and rebalancing for non-admin users', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', role: 'USER' },
      expires: '2099-12-31T23:59:59.999Z',
    } as any)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      { id: 'reg-1', userId: 'user-1', raceId: 'race-1', teamId: null },
    ] as any)

    const fd = baseFormData()
    fd.set('maxDriversPerTeam', '3')
    fd.set('applyRebalance', 'true')
    fd.set(
      'registrationUpdates',
      JSON.stringify([{ id: 'reg-1', carClassId: 'class-1', teamId: null }])
    )

    const result = await saveRaceEdits(fd)

    expect(result.message).toBe('Success')
    expect(prisma.race.update).not.toHaveBeenCalled()
  })

  it('preserves teamsAssigned=true in DB when admin saves with no team assignments in this request', async () => {
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      ...mockRace,
      teamsAssigned: true,
    } as any)

    const fd = baseFormData()
    fd.set('maxDriversPerTeam', '3')

    await saveRaceEdits(fd)

    expect(prisma.race.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamsAssigned: true }),
      })
    )
  })

  it('runs rebalancing before updating race settings when applyRebalance is true', async () => {
    const calls: string[] = []

    vi.mocked(prisma.registration.findMany).mockImplementation(async (query: any) => {
      if (query?.distinct) {
        calls.push('loadCarClassIds')
      }
      return []
    })
    vi.mocked(prisma.race.update).mockImplementation(async () => {
      calls.push('race.update')
      return {} as any
    })

    const fd = baseFormData()
    fd.set('maxDriversPerTeam', '3')
    fd.set('applyRebalance', 'true')

    await saveRaceEdits(fd)

    expect(calls).toContain('loadCarClassIds')
    expect(calls).toContain('race.update')
    expect(calls.indexOf('loadCarClassIds')).toBeLessThan(calls.indexOf('race.update'))
  })
})
