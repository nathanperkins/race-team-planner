import { describe, expect, it, vi } from 'vitest'

// Mock Next.js modules
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
    registration: {
      findMany: vi.fn(),
    },
  },
}))

describe('UserRegistrationsPage sorting and filtering', () => {
  it('should order registrations by start time ascending (closest first)', async () => {
    // This test verifies that we call Prisma with the correct orderBy parameters
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    const mockSession = {
      user: { id: 'user-1', name: 'Test User', role: 'USER' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    const mockUser = { id: 'user-1', name: 'Test User' }

    const now = new Date('2026-02-15T00:00:00Z')
    vi.setSystemTime(now)

    vi.mocked(auth).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([])

    const UserRegistrationsPage = (await import('./page')).default
    await UserRegistrationsPage({ params: Promise.resolve({ userId: 'user-1' }) })

    // Verify orderBy was called with ascending order (we trust Prisma to sort correctly)
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          race: {
            startTime: 'asc', // Should be ascending
          },
        },
      })
    )
  })

  it('should show completed events from past week by default', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    const mockSession = {
      user: { id: 'user-1', name: 'Test User', role: 'USER' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    const mockUser = { id: 'user-1', name: 'Test User' }

    const now = new Date('2026-02-15T00:00:00Z')
    vi.setSystemTime(now)

    vi.mocked(auth).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([])

    const UserRegistrationsPage = (await import('./page')).default
    await UserRegistrationsPage({ params: Promise.resolve({ userId: 'user-1' }) })

    // Verify where clause filters to show past week (7 days ago)
    const expectedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          race: expect.objectContaining({
            endTime: {
              gte: expectedCutoff,
            },
          }),
        }),
      })
    )
  })

  it('should show all events when showCompleted=true', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    const mockSession = {
      user: { id: 'user-1', name: 'Test User', role: 'USER' },
      expires: '2026-12-31T23:59:59.999Z',
    }

    const mockUser = { id: 'user-1', name: 'Test User' }

    const now = new Date('2026-02-15T00:00:00Z')
    vi.setSystemTime(now)

    vi.mocked(auth).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([])

    // Mock searchParams with showCompleted=true
    const UserRegistrationsPage = (await import('./page')).default
    await UserRegistrationsPage({
      params: Promise.resolve({ userId: 'user-1' }),
      searchParams: Promise.resolve({ showCompleted: 'true' }),
    })

    // Verify NO filtering by endTime (shows all events)
    expect(prisma.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
        },
      })
    )
  })
})
