import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TeamPickerModal from './TeamPickerModal'
import { batchAssignTeams } from '@/app/admin/teams/actions'

vi.mock('@/app/admin/teams/actions', () => ({
  batchAssignTeams: vi.fn(),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))

const mockOnClose = vi.fn()

const baseProps = {
  raceStartTime: new Date('2027-06-01T10:00:00Z'),
  className: 'GT3',
  registrations: [],
  teams: [{ id: 'team-1', name: 'Team Alpha' }],
  onClose: mockOnClose,
  raceId: 'race-1',
  carClassId: 'class-1',
}

describe('TeamPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('alert', vi.fn())
  })

  it('renders the Submit Teams button', () => {
    render(<TeamPickerModal {...baseProps} />)
    expect(screen.getByRole('button', { name: /submit teams/i })).toBeInTheDocument()
  })

  it('renders the Cancel button', () => {
    render(<TeamPickerModal {...baseProps} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<TeamPickerModal {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading overlay while saving team assignments', async () => {
    vi.mocked(batchAssignTeams).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 200))
    )

    const user = userEvent.setup()
    render(<TeamPickerModal {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /submit teams/i }))

    expect(screen.getByRole('heading', { name: 'Saving team assignments...' })).toBeInTheDocument()

    // Wait for save to complete to prevent timer leaking into subsequent tests
    await waitFor(
      () =>
        expect(
          screen.queryByRole('heading', { name: 'Saving team assignments...' })
        ).not.toBeInTheDocument(),
      { timeout: 500 }
    )
  })

  it('disables Submit Teams button while saving', async () => {
    vi.mocked(batchAssignTeams).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(undefined), 200))
    )

    const user = userEvent.setup()
    render(<TeamPickerModal {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /submit teams/i }))

    expect(screen.getByRole('button', { name: /submit teams/i })).toBeDisabled()

    // Wait for save to complete to prevent timer leaking into subsequent tests
    await waitFor(() => expect(mockOnClose).toHaveBeenCalled(), { timeout: 500 })
  })

  it('calls onClose after successful save', async () => {
    vi.mocked(batchAssignTeams).mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<TeamPickerModal {...baseProps} />)

    await user.click(screen.getByRole('button', { name: /submit teams/i }))

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  it('renders driver roster when registrations are provided', () => {
    const propsWithDrivers = {
      ...baseProps,
      registrations: [
        {
          id: 'reg-1',
          carClass: { id: 'class-1', name: 'GT3', shortName: 'GT3' },
          userId: 'user-1',
          manualDriverId: null,
          manualDriver: null,
          teamId: null,
          team: null,
          user: { name: 'Alice', image: null, racerStats: [] },
        },
      ],
    }
    render(<TeamPickerModal {...propsWithDrivers} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
