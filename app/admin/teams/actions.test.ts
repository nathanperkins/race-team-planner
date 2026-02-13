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

    await batchAssignTeams(assignments, { raceId, carClassId })

    // Verify that sendTeamsAssignmentNotification was called
    expect(sendTeamsAssignmentNotification).toHaveBeenCalledWith(raceId)
  })

  it('does not send notification if no raceId is provided', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      return callback(prisma as any)
    })

    vi.mocked(prisma as any).registration = {
      update: vi.fn().mockResolvedValue({}),
    }

    const assignments = [{ registrationId: 'reg-1', teamId: 'team-2' }]

    await batchAssignTeams(assignments, { carClassId: 'class-gt3' })

    // Should not send notification without raceId
    expect(sendTeamsAssignmentNotification).not.toHaveBeenCalled()
  })
})
