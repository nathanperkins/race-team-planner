import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('next/link', () => ({
  default: (props: any) => <a href={props.href}>{props.children}</a>,
}))
vi.mock('@/components/DropRegistrationButton', () => ({
  default: () => <button data-testid="drop-registration-button">Drop</button>,
}))
vi.mock('@/components/EditableCarClass', () => ({
  default: () => <div data-testid="editable-car-class" />,
}))
vi.mock('@/components/EditableRaceTime', () => ({
  default: () => <div data-testid="editable-race-time" />,
}))
vi.mock('@/components/AddToCalendarButton', () => ({
  default: () => <button data-testid="add-to-calendar-button">Add to calendar</button>,
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

describe('AddToCalendar button visibility on registrations page', () => {
  const mockSession = {
    user: { id: 'user-1', name: 'Test User', role: 'USER' },
    expires: '2026-12-31T23:59:59.999Z',
  }
  const mockUser = { id: 'user-1', name: 'Test User' }
  const now = new Date('2026-02-22T00:00:00Z')

  const makeRegistration = (endTime: Date) => ({
    id: 'reg-1',
    raceId: 'race-1',
    carClassId: 'class-1',
    carClass: { id: 'class-1', name: 'GT3 Class', shortName: 'GT3' },
    race: {
      id: 'race-1',
      eventId: 'evt-1',
      startTime: new Date('2027-01-01T10:00:00Z'),
      endTime,
      teamsAssigned: false,
      discordTeamsThreadId: null,
      event: {
        id: 'evt-1',
        name: 'Test Series',
        track: 'Sebring',
        trackConfig: null,
        carClasses: [],
        races: [{ id: 'race-1', startTime: new Date('2027-01-01T10:00:00Z') }],
        durationMins: null,
        tempValue: null,
        tempUnits: null,
        relHumidity: null,
      },
    },
    team: null,
  })

  it('shows add-to-calendar button for upcoming races', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    vi.setSystemTime(now)
    vi.mocked(auth).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      makeRegistration(new Date('2027-06-01T12:00:00Z')), // future
    ] as any)

    const UserRegistrationsPage = (await import('./page')).default
    const jsx = await UserRegistrationsPage({ params: Promise.resolve({ userId: 'user-1' }) })
    render(jsx)

    expect(screen.getByTestId('add-to-calendar-button')).toBeInTheDocument()
  })

  it('hides add-to-calendar button for past races', async () => {
    const { auth } = await import('@/lib/auth')
    const prisma = (await import('@/lib/prisma')).default

    vi.setSystemTime(now)
    vi.mocked(auth).mockResolvedValue(mockSession)
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.registration.findMany).mockResolvedValue([
      makeRegistration(new Date('2025-01-01T12:00:00Z')), // past
    ] as any)

    const UserRegistrationsPage = (await import('./page')).default
    const jsx = await UserRegistrationsPage({ params: Promise.resolve({ userId: 'user-1' }) })
    render(jsx)

    expect(screen.queryByTestId('add-to-calendar-button')).not.toBeInTheDocument()
  })
})
