import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncSource, SyncStatus } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  fetchCarClasses,
  fetchDriverStats,
  fetchSpecialEvents,
  fetchTeamMembers,
} from '@/lib/iracing'
import { revalidatePath } from 'next/cache'
import { mockLogger, resetMockLogger } from '@/lib/test-helpers/mock-logger'

const mockFeatures = {
  iracingSync: true,
}

vi.mock('@/lib/config', () => ({
  get features() {
    return mockFeatures
  },
}))

vi.mock('@/lib/logger', () => ({
  createLogger: () => mockLogger,
  logger: mockLogger,
}))

vi.mock('@/lib/iracing', () => ({
  fetchSpecialEvents: vi.fn(),
  fetchCarClasses: vi.fn(),
  fetchDriverStats: vi.fn(),
  fetchTeamMembers: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    syncLog: {
      create: vi.fn(),
      update: vi.fn(),
    },
    carClass: {
      upsert: vi.fn(),
    },
    event: {
      upsert: vi.fn(),
    },
    race: {
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    racerStats: {
      upsert: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    teamMember: {
      upsert: vi.fn(),
    },
    teamMemberRole: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { runIRacingSync, syncSingleTeamMembers } from './sync-service'

describe('syncSingleTeamMembers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMockLogger()
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg)
      }
      if (typeof arg === 'function') {
        return arg(prisma as never)
      }
      return []
    })
  })

  it('upserts team members and atomically updates roles and enrolled user connections', async () => {
    vi.mocked(fetchTeamMembers).mockResolvedValue([
      { custId: 1001, displayName: 'Alice Owner', owner: true, admin: true },
      { custId: 1002, displayName: 'Bob Driver', owner: false, admin: false },
    ])
    vi.mocked(prisma.teamMember.upsert)
      .mockResolvedValueOnce({ id: 'tm-1', custId: 1001, displayName: 'Alice Owner' } as never)
      .mockResolvedValueOnce({ id: 'tm-2', custId: 1002, displayName: 'Bob Driver' } as never)
    vi.mocked(prisma.teamMemberRole.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.teamMemberRole.createMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.team.update).mockResolvedValue({} as never)

    const preloadedUsers = [
      { id: 'user-alice', iracingCustomerId: 1001 },
      { id: 'user-other', iracingCustomerId: 9999 },
    ]

    const result = await syncSingleTeamMembers('team-db-1', 55555, preloadedUsers)

    expect(result).toEqual({ synced: true, memberCount: 2 })
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    expect(prisma.teamMember.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.teamMemberRole.deleteMany).toHaveBeenCalledWith({
      where: { teamId: 'team-db-1' },
    })
    expect(prisma.teamMemberRole.createMany).toHaveBeenCalledWith({
      data: [
        { teamMemberId: 'tm-1', teamId: 'team-db-1', isOwner: true, isAdmin: true },
        { teamMemberId: 'tm-2', teamId: 'team-db-1', isOwner: false, isAdmin: false },
      ],
    })
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 'team-db-1' },
      data: {
        teamMembers: {
          set: [{ id: 'tm-1' }, { id: 'tm-2' }],
        },
        members: {
          set: [{ id: 'user-alice' }],
        },
      },
    })
  })

  it('preserves cached team memberships when fetchTeamMembers returns an empty array', async () => {
    vi.mocked(fetchTeamMembers).mockResolvedValue([])

    const result = await syncSingleTeamMembers('team-db-1', 55555)

    expect(result).toEqual({ synced: false, memberCount: 0 })
    expect(prisma.teamMember.upsert).not.toHaveBeenCalled()
    expect(prisma.teamMemberRole.deleteMany).not.toHaveBeenCalled()
    expect(prisma.team.update).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('skips placeholder teams with non-positive iracingTeamId', async () => {
    const result = await syncSingleTeamMembers('placeholder-team', -101)

    expect(result).toEqual({ synced: false, memberCount: 0 })
    expect(fetchTeamMembers).not.toHaveBeenCalled()
    expect(prisma.team.update).not.toHaveBeenCalled()
  })
})

describe('runIRacingSync team membership refresh (issue #172)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMockLogger()
    mockFeatures.iracingSync = true
    vi.mocked(prisma.$transaction).mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg)
      }
      if (typeof arg === 'function') {
        return arg(prisma as never)
      }
      return []
    })
    vi.mocked(prisma.syncLog.create).mockResolvedValue({ id: 'sync-log-1' } as never)
    vi.mocked(prisma.syncLog.update).mockResolvedValue({} as never)
    vi.mocked(fetchSpecialEvents).mockResolvedValue([])
    vi.mocked(fetchCarClasses).mockResolvedValue([])
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: 'user-1', iracingCustomerId: 1001 },
    ] as never)
    vi.mocked(fetchDriverStats).mockResolvedValue({
      custId: 1001,
      displayName: 'Driver One',
      licenses: {},
    } as never)
    vi.mocked(prisma.user.update).mockResolvedValue({} as never)
  })

  it('syncs real iRacing teams (iracingTeamId > 0) during scheduled sync and continues past individual team failures', async () => {
    vi.mocked(prisma.team.findMany).mockResolvedValue([
      { id: 'team-1', iracingTeamId: 11111 },
      { id: 'team-2', iracingTeamId: 22222 },
    ] as never)

    vi.mocked(fetchTeamMembers)
      .mockRejectedValueOnce(new Error('Transient timeout'))
      .mockResolvedValueOnce([
        { custId: 1001, displayName: 'Driver One', owner: true, admin: false },
      ])

    vi.mocked(prisma.teamMember.upsert).mockResolvedValue({
      id: 'tm-1',
      custId: 1001,
      displayName: 'Driver One',
    } as never)
    vi.mocked(prisma.teamMemberRole.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.teamMemberRole.createMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.team.update).mockResolvedValue({} as never)

    const result = await runIRacingSync(SyncSource.CRON)

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { iracingTeamId: { gt: 0 } },
      select: { id: true, iracingTeamId: true },
    })
    expect(fetchTeamMembers).toHaveBeenCalledTimes(2)
    expect(fetchTeamMembers).toHaveBeenNthCalledWith(1, 11111)
    expect(fetchTeamMembers).toHaveBeenNthCalledWith(2, 22222)
    expect(result).toEqual({
      success: true,
      eventsCount: 0,
      carClassesCount: 0,
      usersCount: 1,
      teamsCount: 1,
    })
    expect(prisma.syncLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sync-log-1' },
        data: expect.objectContaining({ status: SyncStatus.SUCCESS }),
      })
    )
    expect(revalidatePath).toHaveBeenCalledWith('/events')
    expect(revalidatePath).toHaveBeenCalledWith('/roster')
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
  })
})
