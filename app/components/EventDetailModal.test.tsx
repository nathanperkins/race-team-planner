import { render, screen } from '@testing-library/react'
import EventDetailModal from './EventDetailModal'
import { describe, it, expect, vi } from 'vitest'

// Mock icons to avoid lucide-react render issues in tests if any
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
  Cloud: () => <div data-testid="icon-cloud" />,
  ShieldCheck: () => <div data-testid="icon-shield-check" />,
  ShieldX: () => <div data-testid="icon-shield-x" />,
  Thermometer: () => <div data-testid="icon-thermometer" />,
  Droplets: () => <div data-testid="icon-droplets" />,
  Timer: () => <div data-testid="icon-timer" />,
  MapPin: () => <div data-testid="icon-map-pin" />,
  Calendar: () => <div data-testid="icon-calendar" />,
  Car: () => <div data-testid="icon-car" />,
}))

// Mock RaceDetails to render children so we can test driver/team lists
vi.mock('@/components/RaceDetails', () => ({
  default: ({ race }: any) => (
    <div data-testid="race-details">
      {race.registrations?.map((reg: any) => (
        <div key={reg.id}>
          {reg.user?.name}
          {reg.team?.name}
        </div>
      ))}
    </div>
  ),
}))

// Mock EditEventButton
vi.mock('@/app/admin/EditEventButton', () => ({
  default: () => <div data-testid="edit-event-btn">Edit Event</div>,
}))

describe('EventDetailModal', () => {
  // Mock Event Data
  const mockEvent = {
    id: 'evt-123',
    name: 'Test Series - 2026 Season 1',
    description: 'Test Description',
    startTime: new Date('2026-03-06T19:00:00Z'), // This should be Week 12 of 2026 S1
    endTime: new Date('2026-03-07T00:00:00Z'),
    track: 'Test Track',
    trackConfig: 'Full Course',
    durationMins: 60,
    licenseGroup: 4,
    tempValue: 70,
    tempUnits: 0,
    relHumidity: 50,
    skies: 1,
    precipChance: 0,
    carClasses: [{ id: 1, name: 'GT3 Class', shortName: 'GT3' }],
    races: [
      {
        id: 'race-1',
        startTime: new Date('2026-03-06T19:00:00Z'),
        registrations: [
          {
            id: 'reg-1',
            user: { name: 'Driver 1' },
            team: { name: 'Team Alpha' },
          },
          {
            id: 'reg-2',
            user: { name: 'Driver 2' },
            team: null,
          },
        ],
      },
    ],
  }

  const defaultProps = {
    event: mockEvent as any,
    onClose: vi.fn(),
    isAdmin: false,
    userId: 'user-1',
    userLicenseLevel: null,
    teams: [],
    discordGuildId: 'guild-1',
  }

  it('renders season and week information correctly', () => {
    render(<EventDetailModal {...defaultProps} />)

    // Based on our previous verification:
    // March 6, 2026 is Week 12 of Season 1, 2026.
    // The modal should display "2026 • Season 1 • Week 12"

    const seasonText = screen.getByText(/2026 • Season 1 • Week 12/i)
    expect(seasonText).toBeInTheDocument()
  })

  it('renders track name correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/Test Track - Full Course/)).toBeInTheDocument()
  })

  it('renders car class correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/GT3/)).toBeInTheDocument()
  })

  it('renders the description correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/Test Description/)).toBeInTheDocument()
  })

  it('renders the temp correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/70\s*°\s*F/)).toBeInTheDocument()
  })

  it('renders the start time correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/3\/6/)).toBeInTheDocument()
    expect(screen.getByText(/11:00 AM PST/)).toBeInTheDocument()
  })

  it('renders the duration correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/1h/)).toBeInTheDocument()
  })

  it('renders the drivers correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/Driver 1/)).toBeInTheDocument()
    expect(screen.getByText(/Driver 2/)).toBeInTheDocument()
  })
  it('renders the teams correctly', () => {
    render(<EventDetailModal {...defaultProps} />)
    expect(screen.getByText(/Team Alpha/)).toBeInTheDocument()
  })
})
