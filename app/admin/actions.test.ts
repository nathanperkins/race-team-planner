import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createCustomEvent, updateCustomEvent } from './actions'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'

vi.mock('@/lib/prisma', () => ({
  default: {
    event: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    carClass: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    race: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('admin actions', () => {
  const mockAdminSession = { user: { id: 'admin-1', role: 'ADMIN' } }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
    vi.mocked(prisma.$transaction).mockImplementation(async (cbOrOps: any) => {
      if (typeof cbOrOps === 'function') {
        return cbOrOps(prisma)
      }
      return Promise.all(cbOrOps)
    })
  })

  describe('createCustomEvent', () => {
    it('creates an event with multiple races for multiple start times', async () => {
      const formData = new FormData()
      formData.append('name', 'Sebring 12hr')
      formData.append('track', 'Sebring International Raceway')
      formData.append('durationMins', '720')
      formData.append('carClasses', 'GTP, LMP2')
      formData.append('startTimes', '2027-06-01T10:00:00')
      formData.append('startTimes', '2027-06-02T10:00:00')

      vi.mocked(prisma.event.create).mockResolvedValue({ id: 'event-1' } as any)

      const result = await createCustomEvent({ message: '' }, formData)

      expect(result).toEqual({ message: 'Success' })

      const createArgs = vi.mocked(prisma.event.create).mock.calls[0][0]
      expect(createArgs.data.name).toBe('Sebring 12hr')
      // Races should be created for each start time
      expect(createArgs.data.races.create).toHaveLength(2)
      expect(createArgs.data.races.create[0].startTime.toISOString()).toContain('2027-06-01T')
      expect(createArgs.data.races.create[1].startTime.toISOString()).toContain('2027-06-02T')
    })

    it('returns error if missing track, startTimes, or car classes', async () => {
      const formData = new FormData()
      formData.append('name', 'Missing Stuff')
      // Missing track, startTimes, carClassesInput

      const result = await createCustomEvent({ message: '' }, formData)
      expect(result.message).toContain('are required')
    })
  })

  describe('updateCustomEvent', () => {
    it('updates an event and creates/updates/deletes races appropriately', async () => {
      const formData = new FormData()
      formData.append('eventId', 'event-1')
      formData.append('name', 'Updated Sebring')
      formData.append('track', 'Sebring Raceway')
      formData.append('durationMins', '720')
      formData.append('carClasses', 'GTP, LMP2')

      formData.append('startTimes', '2027-06-01T10:00:00')
      formData.append('raceIds', 'race-1') // Update existing

      formData.append('startTimes', '2027-06-02T10:00:00')
      formData.append('raceIds', '') // Create new

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-1',
        externalId: null,
      } as any)

      vi.mocked(prisma.race.findMany).mockResolvedValue([
        { id: 'race-1', eventId: 'event-1' },
        { id: 'race-old', eventId: 'event-1' }, // old race, should be deleted
      ] as any)

      vi.mocked(prisma.race.create).mockResolvedValue({ id: 'race-2' } as any)

      const result = await updateCustomEvent({ message: '' }, formData)
      expect(result).toEqual({ message: 'Success' })

      expect(prisma.event.update).toHaveBeenCalled()
      expect(prisma.race.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'race-1' },
        })
      )
      expect(prisma.race.create).toHaveBeenCalled()
      expect(prisma.race.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['race-old'] } },
        })
      )
    })

    it('returns error if event is synced (externalId)', async () => {
      const formData = new FormData()
      formData.append('eventId', 'event-1')
      formData.append('name', 'Updated Sebring')
      formData.append('track', 'Sebring Raceway')
      formData.append('carClasses', 'GTP')
      formData.append('startTimes', '2027-06-01T10:00:00')

      // Mock an event that has an externalId
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'event-1',
        externalId: 'external-abc',
      } as any)

      const result = await updateCustomEvent({ message: '' }, formData)
      expect(result.message).toContain('Cannot edit synced events')
      expect(prisma.event.update).not.toHaveBeenCalled()
    })
  })
})
