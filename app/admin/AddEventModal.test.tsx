import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AddEventModal from './AddEventModal'
import { createCustomEvent } from './actions'

vi.mock('./actions', () => ({
  createCustomEvent: vi.fn(),
}))

const mockOnClose = vi.fn()

const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/event name/i), 'Sebring 12hr')
  await user.type(screen.getByLabelText(/^track \*/i), 'Sebring International Raceway')
  await user.type(screen.getByLabelText(/start time/i), '2027-06-01T10:00')
}

describe('AddEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form fields', () => {
    render(<AddEventModal onClose={mockOnClose} />)
    expect(screen.getByLabelText(/event name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^track \*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
  })

  it('renders the Create Event submit button', () => {
    render(<AddEventModal onClose={mockOnClose} />)
    expect(screen.getByRole('button', { name: /create event/i })).toBeInTheDocument()
  })

  it('renders the Cancel button', () => {
    render(<AddEventModal onClose={mockOnClose} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<AddEventModal onClose={mockOnClose} />)

    const backdrop = container.querySelector('[class*="backdrop"]') as HTMLElement
    await user.click(backdrop)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading overlay while creating event', async () => {
    vi.mocked(createCustomEvent).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ message: '' }), 200))
    )

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(screen.getByRole('heading', { name: 'Creating event...' })).toBeInTheDocument()
  })

  it('disables submit button while pending', async () => {
    vi.mocked(createCustomEvent).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ message: '' }), 200))
    )

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()
  })

  it('shows error message on submission failure', async () => {
    vi.mocked(createCustomEvent).mockResolvedValue({ message: 'Event name already exists' })

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    await waitFor(() => {
      expect(screen.getByText('Event name already exists')).toBeInTheDocument()
    })
  })
})
