import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendTeamsAssignmentNotification } from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import {
  createTeamThread,
  sendTeamsAssignedNotification as sendDiscordNotification,
} from '@/lib/discord'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    race: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    registration: {
      findMany: vi.fn(),
    },
  },
}))

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

// Mock discord
vi.mock('@/lib/discord', () => ({
  createTeamThread: vi.fn(),
  addUsersToThread: vi.fn(),
  buildTeamThreadLink: vi.fn(
    ({ guildId, threadId }: { guildId: string; threadId: string }) =>
      `discord://-/channels/${guildId}/${threadId}`
  ),
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
        discordTeamsThreadId: 'event-thread-id',
        discordTeamThreads: { 'team-1': 'team-thread-1' },
      }),
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
        discordTeamsThreadId: 'event-thread-id',
        discordTeamThreads: {
          'team-1': 'team-thread-1',
          'team-2': 'team-thread-2',
        },
      }),
    })
  })
})
