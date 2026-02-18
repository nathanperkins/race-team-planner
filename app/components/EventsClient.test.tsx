import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRouter, useSearchParams } from 'next/navigation'
import EventsClient from './EventsClient'
import type { Prisma } from '@prisma/client'
import { LicenseLevel } from '@/lib/utils'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as any)
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any)
})

vi.mock('./EventDetailModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="event-modal">
      <button onClick={onClose} type="button">
        Close Modal
      </button>
    </div>
  ),
}))

// ---------------------------------------------------------------------------
// Typed factories — cast is scoped here, not scattered across each test
// ---------------------------------------------------------------------------

type EventWithRaces = Prisma.EventGetPayload<{
  include: {
    carClasses: true
    races: {
      include: {
        registrations: {
          include: {
            user: { include: { racerStats: true } }
            carClass: true
            team: true
            manualDriver: true
          }
        }
      }
    }
  }
}>

function makeRegistration(fields: { userId?: string | null; id?: string } = {}) {
  return {
    id: fields.id ?? 'reg-1',
    userId: fields.userId ?? 'user-123',
    manualDriverId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    raceId: 'race-1',
    carClassId: 'class-1',
    teamId: null,
    carClass: {
      id: 'class-1',
      externalId: 1,
      name: 'IMSA23',
      shortName: 'IMSA23',
      createdAt: new Date(),
    },
    manualDriver: null,
    team: null,
    user: {
      id: fields.userId ?? 'user-123',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      expectationsVersion: 1,
      role: 'USER' as const,
      iracingName: null,
      onboardedAnnounced: false,
      iracingCustomerId: null,
      racerStats: [],
    },
  }
}

function makeRace(
  fields: {
    id?: string
    startTime?: Date
    endTime?: Date
    registrations?: ReturnType<typeof makeRegistration>[]
  } = {}
) {
  return {
    id: fields.id ?? 'race-1',
    externalId: null,
    startTime: fields.startTime ?? new Date('2026-02-15T06:00:00Z'),
    endTime: fields.endTime ?? new Date('2026-02-15T08:00:00Z'),
    teamsAssigned: false,
    discordTeamsThreadId: null,
    discordTeamsSnapshot: null,
    discordTeamThreads: null,
    maxDriversPerTeam: null,
    teamAssignmentStrategy: 'BALANCED_IRATING' as const,
    eventId: 'event-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    registrations: fields.registrations ?? [],
  }
}

function makeEvent(
  fields: {
    id?: string
    name?: string
    licenseGroup?: number | null
    races?: ReturnType<typeof makeRace>[]
    startTime?: Date
    endTime?: Date
  } = {}
): EventWithRaces {
  return {
    id: fields.id ?? 'event-1',
    name: fields.name ?? 'IMSA Endurance Series',
    startTime: fields.startTime ?? new Date('2026-02-15T06:00:00Z'),
    endTime: fields.endTime ?? new Date('2026-02-15T08:00:00Z'),
    licenseGroup: fields.licenseGroup ?? 3,
    durationMins: 120,
    track: 'Daytona',
    trackConfig: 'Road',
    externalId: null,
    tempValue: null,
    tempUnits: null,
    relHumidity: null,
    skies: null,
    precipChance: null,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    carClasses: [
      { id: 'class-1', externalId: 1, name: 'IMSA23', shortName: 'IMSA23', createdAt: new Date() },
    ],
    races: (fields.races ?? [makeRace()]) as EventWithRaces['races'],
  } as EventWithRaces
}

function makeWeek(fields: { events?: EventWithRaces[]; weekNumber?: number } = {}) {
  return {
    weekStart: new Date('2026-02-09T00:00:00Z'),
    weekEnd: new Date('2026-02-16T00:00:00Z'),
    weekNumber: fields.weekNumber ?? 5,
    seasonYear: 2026,
    seasonQuarter: 1,
    official: true,
    meta: { events: 1, tracks: ['Daytona'], classes: ['IMSA23'] },
    events: fields.events ?? [makeEvent()],
  }
}

// ---------------------------------------------------------------------------
// Registered badge
// ---------------------------------------------------------------------------

describe('EventsClient registered badge', () => {
  it('shows "Registered" badge for events the user is registered for', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            id: 'event-registered',
            name: 'IMSA Endurance Series',
            races: [makeRace({ registrations: [makeRegistration({ userId: 'user-123' })] })],
          }),
          makeEvent({
            id: 'event-not-registered',
            name: 'GT3 Challenge Series',
            races: [makeRace({ id: 'race-2' })],
          }),
        ],
      }),
    ]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    const eventButtons = screen.getAllByRole('button')
    expect(eventButtons[0]).toHaveTextContent('Registered')
    expect(eventButtons[1]).not.toHaveTextContent('Registered')
  })

  it('does not show "Registered" badge when user has no registrations', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [makeRace({ registrations: [makeRegistration({ userId: 'other-user' })] })],
          }),
        ],
      }),
    ]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(screen.getAllByRole('button')[0]).not.toHaveTextContent('Registered')
  })

  it('shows "Registered" badge when user is registered for at least one race in multi-race event', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [
              makeRace({ id: 'race-1', registrations: [makeRegistration({ userId: 'user-123' })] }),
              makeRace({
                id: 'race-2',
                registrations: [makeRegistration({ id: 'reg-2', userId: 'other-user' })],
              }),
            ],
          }),
        ],
      }),
    ]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(screen.getAllByRole('button')[0]).toHaveTextContent('Registered')
  })
})

// ---------------------------------------------------------------------------
// Optimistic modal
// ---------------------------------------------------------------------------

describe('EventsClient optimistic modal', () => {
  const weeks = [makeWeek()]

  it('opens the modal immediately when an event card is clicked, before RSC responds', () => {
    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={null}
        teams={[]}
      />
    )

    expect(screen.queryByTestId('event-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /IMSA Endurance Series/i }))
    expect(screen.getByTestId('event-modal')).toBeInTheDocument()
  })

  it('clears optimistic event when selectedEvent transitions from truthy to null (browser back)', () => {
    const event = makeEvent()
    const { rerender } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={event}
        teams={[]}
      />
    )

    expect(screen.getByTestId('event-modal')).toBeInTheDocument()

    rerender(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={null}
        teams={[]}
      />
    )

    expect(screen.queryByTestId('event-modal')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Scroll lock
// ---------------------------------------------------------------------------

describe('EventsClient scroll lock', () => {
  const weeks = [makeWeek()]

  it('locks page scrolling while the event modal is open', async () => {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''

    const { rerender } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={weeks[0].events[0]}
        teams={[]}
      />
    )

    expect(screen.queryByTestId('event-modal')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Close Modal' }))
    rerender(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={null}
        teams={[]}
      />
    )
    await waitFor(() => {
      expect(document.body.style.overflow).toBe('')
      expect(document.documentElement.style.overflow).toBe('')
    })
  })

  it('should not render details modal with no selected event', () => {
    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={null}
        teams={[]}
      />
    )

    expect(screen.queryByTestId('event-modal')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })
})

// ---------------------------------------------------------------------------
// LIVE badge
// ---------------------------------------------------------------------------

describe('EventsClient LIVE badge', () => {
  it('shows LIVE badge when a race is currently in progress', () => {
    const now = new Date()
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [
              makeRace({
                startTime: new Date(now.getTime() - 60_000),
                endTime: new Date(now.getTime() + 60_000),
              }),
            ],
          }),
        ],
      }),
    ]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(screen.getAllByText('LIVE').length).toBeGreaterThan(0)
  })

  it('does not show LIVE badge when no race is currently in progress', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [
              makeRace({
                startTime: new Date('2026-01-01T06:00:00Z'),
                endTime: new Date('2026-01-01T08:00:00Z'),
              }),
            ],
          }),
        ],
      }),
    ]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Race pill completed state
// ---------------------------------------------------------------------------

describe('EventsClient race pill completed state', () => {
  it('applies completed style to race pills whose start time is in the past', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [
              makeRace({
                startTime: new Date('2026-01-01T06:00:00Z'),
                endTime: new Date('2026-01-01T08:00:00Z'),
              }),
            ],
          }),
        ],
      }),
    ]

    const { container } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(container.querySelector('[class*="racePillCompleted"]')).toBeInTheDocument()
  })

  it('does not apply completed style to future race pills', () => {
    const weeks = [
      makeWeek({
        events: [
          makeEvent({
            races: [
              makeRace({
                startTime: new Date('2099-01-01T06:00:00Z'),
                endTime: new Date('2099-01-01T08:00:00Z'),
              }),
            ],
          }),
        ],
      }),
    ]

    const { container } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    expect(container.querySelector('[class*="racePillCompleted"]')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// License eligibility (ShieldCheck vs ShieldX)
// ---------------------------------------------------------------------------

describe('EventsClient license eligibility', () => {
  it('does not mark row ineligible when user meets the license requirement', () => {
    const weeks = [makeWeek({ events: [makeEvent({ licenseGroup: LicenseLevel.C })] })]

    const { container } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={LicenseLevel.C}
        teams={[]}
      />
    )

    expect(container.querySelector('[class*="eventRowIneligible"]')).not.toBeInTheDocument()
  })

  it('marks row ineligible when user does not meet the license requirement', () => {
    const weeks = [makeWeek({ events: [makeEvent({ licenseGroup: LicenseLevel.A })] })]

    const { container } = render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={LicenseLevel.D}
        teams={[]}
      />
    )

    expect(container.querySelector('[class*="eventRowIneligible"]')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// handleCloseModal — removes eventId from URL, preserves other params
// ---------------------------------------------------------------------------

describe('EventsClient handleCloseModal URL cleanup', () => {
  it('removes eventId param and preserves other filters when modal is closed', () => {
    const push = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ push } as any)
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('eventId=event-1&from=2026-01-01&name=test') as any
    )

    const weeks = [makeWeek()]

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        selectedEvent={weeks[0].events[0]}
        teams={[]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close Modal' }))

    expect(push).toHaveBeenCalled()
    const url: string = push.mock.calls[0][0]
    expect(url).not.toContain('eventId')
    expect(url).toContain('from=2026-01-01')
    expect(url).toContain('name=test')
  })
})
