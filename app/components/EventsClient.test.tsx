import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EventsClient from './EventsClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
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

describe('EventsClient scroll lock', () => {
  it('locks page scrolling while the event modal is open', async () => {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''

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

    render(
      <EventsClient
        weeks={weeks}
        isAdmin={false}
        userId="user-1"
        userLicenseLevel={null}
        teams={[]}
      />
    )

    const eventButton = screen.getAllByRole('button')[0]
    fireEvent.click(eventButton)

    expect(screen.getByTestId('event-modal')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Close Modal' }))

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('')
      expect(document.documentElement.style.overflow).toBe('')
    })
  })
})
