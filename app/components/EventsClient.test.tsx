import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventsClient from './EventsClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('./EventDetailModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="event-modal">
      <button onClick={onClose} type="button">
        Close Modal
      </button>
    </div>
  ),
}))

describe('EventsClient registered badge', () => {
  it('shows "Registered" badge for events the user is registered for', () => {
    const weeks = [
      {
        weekStart: new Date('2026-02-09T00:00:00Z'),
        weekEnd: new Date('2026-02-16T00:00:00Z'),
        weekNumber: 5,
        seasonYear: 2026,
        seasonQuarter: 1,
        official: true,
        meta: {
          events: 2,
          tracks: ['Daytona', 'Spa'],
          classes: ['IMSA23', 'GT3'],
        },
        events: [
          {
            id: 'event-registered',
            name: 'IMSA Endurance Series',
            startTime: new Date('2026-02-15T06:00:00Z'),
            endTime: new Date('2026-02-15T08:00:00Z'),
            licenseGroup: 3,
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
            carClasses: [{ id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' }],
            races: [
              {
                id: 'race-1',
                startTime: new Date('2026-02-15T06:00:00Z'),
                endTime: new Date('2026-02-15T08:00:00Z'),
                registrations: [
                  {
                    id: 'reg-1',
                    userId: 'user-123',
                    user: { name: 'Test User', id: 'user-123', image: null, racerStats: [] },
                    carClass: { id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' },
                    team: null,
                    manualDriver: null,
                  },
                ],
              },
            ],
          },
          {
            id: 'event-not-registered',
            name: 'GT3 Challenge Series',
            startTime: new Date('2026-02-16T06:00:00Z'),
            endTime: new Date('2026-02-16T08:00:00Z'),
            licenseGroup: 3,
            durationMins: 120,
            track: 'Spa',
            trackConfig: 'GP',
            externalId: null,
            tempValue: null,
            tempUnits: null,
            relHumidity: null,
            skies: null,
            precipChance: null,
            description: null,
            carClasses: [{ id: 'class-2', name: 'GT3', shortName: 'GT3' }],
            races: [
              {
                id: 'race-2',
                startTime: new Date('2026-02-16T06:00:00Z'),
                endTime: new Date('2026-02-16T08:00:00Z'),
                registrations: [],
              },
            ],
          },
        ],
      },
    ] as any

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    // Should show "Registered" badge for the first event
    const eventButtons = screen.getAllByRole('button')
    const firstEventButton = eventButtons[0]
    expect(firstEventButton).toHaveTextContent('Registered')

    // Should NOT show "Registered" badge for the second event
    const secondEventButton = eventButtons[1]
    expect(secondEventButton).not.toHaveTextContent('Registered')
  })

  it('does not show "Registered" badge when user has no registrations', () => {
    const weeks = [
      {
        weekStart: new Date('2026-02-09T00:00:00Z'),
        weekEnd: new Date('2026-02-16T00:00:00Z'),
        weekNumber: 5,
        seasonYear: 2026,
        seasonQuarter: 1,
        official: true,
        meta: {
          events: 1,
          tracks: ['Daytona'],
          classes: ['IMSA23'],
        },
        events: [
          {
            id: 'event-1',
            name: 'IMSA Endurance Series',
            startTime: new Date('2026-02-15T06:00:00Z'),
            endTime: new Date('2026-02-15T08:00:00Z'),
            licenseGroup: 3,
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
            carClasses: [{ id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' }],
            races: [
              {
                id: 'race-1',
                startTime: new Date('2026-02-15T06:00:00Z'),
                endTime: new Date('2026-02-15T08:00:00Z'),
                registrations: [
                  {
                    id: 'reg-1',
                    userId: 'other-user',
                    user: { name: 'Other User', id: 'other-user', image: null, racerStats: [] },
                    carClass: { id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' },
                    team: null,
                    manualDriver: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as any

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    const eventButton = screen.getAllByRole('button')[0]
    expect(eventButton).not.toHaveTextContent('Registered')
  })

  it('shows "Registered" badge when user is registered for at least one race in multi-race event', () => {
    const weeks = [
      {
        weekStart: new Date('2026-02-09T00:00:00Z'),
        weekEnd: new Date('2026-02-16T00:00:00Z'),
        weekNumber: 5,
        seasonYear: 2026,
        seasonQuarter: 1,
        official: true,
        meta: {
          events: 1,
          tracks: ['Daytona'],
          classes: ['IMSA23'],
        },
        events: [
          {
            id: 'event-multi-race',
            name: 'Multi-Race Event',
            startTime: new Date('2026-02-15T06:00:00Z'),
            endTime: new Date('2026-02-16T08:00:00Z'),
            licenseGroup: 3,
            durationMins: 240,
            track: 'Daytona',
            trackConfig: 'Road',
            externalId: null,
            tempValue: null,
            tempUnits: null,
            relHumidity: null,
            skies: null,
            precipChance: null,
            description: null,
            carClasses: [{ id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' }],
            races: [
              {
                id: 'race-1',
                startTime: new Date('2026-02-15T06:00:00Z'),
                endTime: new Date('2026-02-15T08:00:00Z'),
                registrations: [
                  {
                    id: 'reg-1',
                    userId: 'user-123',
                    user: { name: 'Test User', id: 'user-123', image: null, racerStats: [] },
                    carClass: { id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' },
                    team: null,
                    manualDriver: null,
                  },
                ],
              },
              {
                id: 'race-2',
                startTime: new Date('2026-02-16T06:00:00Z'),
                endTime: new Date('2026-02-16T08:00:00Z'),
                registrations: [
                  {
                    id: 'reg-2',
                    userId: 'other-user',
                    user: { name: 'Other User', id: 'other-user', image: null, racerStats: [] },
                    carClass: { id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' },
                    team: null,
                    manualDriver: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ] as any

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-123"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    // Should show "Registered" badge even though user is only registered for 1 of 2 races
    const eventButton = screen.getAllByRole('button')[0]
    expect(eventButton).toHaveTextContent('Registered')
  })
})

describe('EventsClient optimistic modal', () => {
  const weeks = [
    {
      weekStart: new Date('2026-02-09T00:00:00Z'),
      weekEnd: new Date('2026-02-16T00:00:00Z'),
      weekNumber: 5,
      seasonYear: 2026,
      seasonQuarter: 1,
      official: true,
      meta: { events: 1, tracks: ['Daytona'], classes: ['IMSA23'] },
      events: [
        {
          id: 'event-1',
          name: 'IMSA Endurance Series',
          startTime: new Date('2026-02-15T06:00:00Z'),
          endTime: new Date('2026-02-15T08:00:00Z'),
          licenseGroup: 3,
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
          carClasses: [{ id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' }],
          races: [
            {
              id: 'race-1',
              startTime: new Date('2026-02-15T06:00:00Z'),
              endTime: new Date('2026-02-15T08:00:00Z'),
              registrations: [],
            },
          ],
        },
      ],
    },
  ] as any

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
})

describe('EventsClient scroll lock', () => {
  const weeks = [
    {
      weekStart: new Date('2026-02-09T00:00:00Z'),
      weekEnd: new Date('2026-02-16T00:00:00Z'),
      weekNumber: 5,
      seasonYear: 2026,
      seasonQuarter: 1,
      official: true,
      meta: {
        events: 1,
        tracks: ['Daytona'],
        classes: ['IMSA23'],
      },
      events: [
        {
          id: 'event-1',
          name: 'IMSA Endurance Series - 2026 Season 1 - Week 5',
          startTime: new Date('2026-02-15T06:00:00Z'),
          endTime: new Date('2026-02-15T08:00:00Z'),
          licenseGroup: 'C',
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
          carClasses: [{ id: 'class-1', name: 'IMSA23', shortName: 'IMSA23' }],
          races: [
            {
              id: 'race-1',
              startTime: new Date('2026-02-15T06:00:00Z'),
              endTime: new Date('2026-02-15T08:00:00Z'),
              registrations: [],
            },
          ],
        },
      ],
    },
  ] as any

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
