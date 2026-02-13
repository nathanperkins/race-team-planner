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

    // Mock the race with existing snapshot
    vi.mocked(prisma.race.findUnique).mockResolvedValue({
      id: raceId,
      teamsAssigned: true,
      discordTeamsSnapshot: {
        'reg-1': { teamId: 'team-1', driverName: 'Alice' },
      },
    } as any)

    // Mock the transaction to execute successfully
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    // Mock the update to succeed
    vi.mocked(prisma as any).registration = {
      update: vi.fn().mockResolvedValue({}),
    }

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

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    const mockUpdate = vi.fn().mockResolvedValue({})
    vi.mocked(prisma as any).registration = {
      update: mockUpdate,
    }

    const assignments = [
      { registrationId: 'reg-1', teamId: 'team-2' }, // Existing registration
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that update was called with ONLY teamId (not raceId or carClassId)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        teamId: 'team-2',
      },
    })
  })

  it('inherits car class from team when creating new manual driver', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    const mockCreate = vi.fn().mockResolvedValue({})
    const mockFindFirst = vi
      .fn()
      // First call: find manual driver (returns null, will create new)
      .mockResolvedValueOnce(null)
      // Second call: find team's existing registration to get car class
      .mockResolvedValueOnce({ carClassId: 'class-lmp2' })

    vi.mocked(prisma as any).manualDriver = {
      findFirst: mockFindFirst,
      create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
    }
    vi.mocked(prisma as any).registration = {
      findFirst: mockFindFirst,
      create: mockCreate,
    }

    const assignments = [
      {
        manualName: 'New Driver',
        manualIR: 1500,
        teamId: 'team-1',
      },
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that the new registration uses the team's car class (LMP2), not the provided GT3
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        manualDriverId: 'manual-1',
        teamId: 'team-1',
        raceId: 'race-123',
        carClassId: 'class-lmp2', // Inherited from team, not the provided GT3
      },
    })
  })

  it('falls back to provided car class when team has no existing members', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    const mockCreate = vi.fn().mockResolvedValue({})
    const mockFindFirst = vi
      .fn()
      // First call: find manual driver (returns null)
      .mockResolvedValueOnce(null)
      // Second call: find team's registration (no existing members)
      .mockResolvedValueOnce(null)

    vi.mocked(prisma as any).manualDriver = {
      findFirst: mockFindFirst,
      create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
    }
    vi.mocked(prisma as any).registration = {
      findFirst: mockFindFirst,
      create: mockCreate,
    }

    const assignments = [
      {
        manualName: 'New Driver',
        manualIR: 1500,
        teamId: 'team-1',
      },
    ]

    await batchAssignTeams(assignments, raceId, carClassId)

    // Verify that the new registration uses the provided car class (GT3) as fallback
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        manualDriverId: 'manual-1',
        teamId: 'team-1',
        raceId: 'race-123',
        carClassId: 'class-gt3', // Falls back to provided carClassId
      },
    })
  })

  it('handles mixed assignment of existing and new drivers correctly', async () => {
    const raceId = 'race-123'
    const carClassId = 'class-gt3'

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    const mockUpdate = vi.fn().mockResolvedValue({})
    const mockCreate = vi.fn().mockResolvedValue({})
    const mockFindFirst = vi
      .fn()
      // First call: find manual driver (returns null, will create)
      .mockResolvedValueOnce(null)
      // Second call: find team's existing registration for car class
      .mockResolvedValueOnce({ carClassId: 'class-lmp2' })

    vi.mocked(prisma as any).manualDriver = {
      findFirst: mockFindFirst,
      create: vi.fn().mockResolvedValue({ id: 'manual-1' }),
    }
    vi.mocked(prisma as any).registration = {
      update: mockUpdate,
      findFirst: mockFindFirst,
      create: mockCreate,
    }

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
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: {
        teamId: 'team-2',
      },
    })

    // Verify new manual driver inherited car class from team
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        manualDriverId: 'manual-1',
        teamId: 'team-2',
        raceId: 'race-123',
        carClassId: 'class-lmp2', // Inherited from team
      },
    })

    // Verify notification was sent
    expect(sendTeamsAssignmentNotification).toHaveBeenCalledWith(raceId)
  })
})
