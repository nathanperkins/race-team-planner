import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import EditEventModal from './EditEventModal'
import { updateCustomEvent, deleteCustomEvent } from './actions'

vi.mock('./actions', () => ({
  updateCustomEvent: vi.fn(),
  deleteCustomEvent: vi.fn(),
}))

const mockOnClose = vi.fn()

const mockEvent = {
  id: 'event-1',
  name: 'Sebring 12hr',
  track: 'Sebring International Raceway',
  trackConfig: null,
  description: null,
  startTime: new Date('2027-06-01T10:00:00Z'),
  endTime: new Date('2027-06-01T22:00:00Z'),
  durationMins: 720,
  licenseGroup: null,
  tempValue: null,
  tempUnits: null,
  relHumidity: null,
  skies: null,
  precipChance: null,
  carClasses: [],
}

describe('EditEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form with prefilled event data', () => {
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)
    expect(screen.getByDisplayValue('Sebring 12hr')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sebring International Raceway')).toBeInTheDocument()
  })

  it('renders the Update Event button', () => {
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)
    expect(screen.getByRole('button', { name: /update event/i })).toBeInTheDocument()
  })

  it('renders the Delete Event button', () => {
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)
    expect(screen.getByRole('button', { name: /delete event/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading overlay while updating event', async () => {
    vi.mocked(updateCustomEvent).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ message: '' }), 200))
    )

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /update event/i }))

    expect(screen.getByRole('heading', { name: 'Updating event...' })).toBeInTheDocument()
  })

  it('shows loading overlay while deleting event', async () => {
    vi.mocked(deleteCustomEvent).mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ success: false, message: '' }), 200))
    )

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /delete event/i }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Event?' })
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    expect(screen.getByRole('heading', { name: 'Deleting event...' })).toBeInTheDocument()
  })

  it('does not delete if confirmation modal is cancelled', async () => {
    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /delete event/i }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Event?' })
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(deleteCustomEvent).not.toHaveBeenCalled()
  })

  it('calls onClose after successful update', async () => {
    vi.mocked(updateCustomEvent).mockResolvedValue({ message: 'Success' })

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /update event/i }))

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('shows error message when update fails', async () => {
    vi.mocked(updateCustomEvent).mockResolvedValue({ message: 'Failed to update event' })

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /update event/i }))

    await waitFor(() => {
      expect(screen.getByText('Failed to update event')).toBeInTheDocument()
    })
  })
})
