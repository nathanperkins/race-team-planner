import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import EditEventModal from './EditEventModal'
import { updateCustomEvent, deleteCustomEvent } from './actions'
import { TimeZoneProvider } from '@/components/TimeZoneProvider'

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
  carClasses: [{ shortName: 'GTP' }],
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
    let resolveUpdate!: (value: { message: string }) => void
    vi.mocked(updateCustomEvent).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve
        })
    )

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /update event/i }))

    expect(screen.getByRole('heading', { name: 'Updating event...' })).toBeInTheDocument()

    await act(async () => {
      resolveUpdate({ message: '' })
    })
  })

  it('shows loading overlay while deleting event', async () => {
    let resolveDelete!: (value: { success: boolean; message: string }) => void
    vi.mocked(deleteCustomEvent).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve
        })
    )

    const user = userEvent.setup()
    render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

    await user.click(screen.getByRole('button', { name: /delete event/i }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Event?' })
    await user.click(within(dialog).getByRole('button', { name: /confirm/i }))

    expect(screen.getByRole('heading', { name: 'Deleting event...' })).toBeInTheDocument()

    await act(async () => {
      resolveDelete({ success: false, message: '' })
    })
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

    expect(await screen.findByText('Failed to update event')).toBeInTheDocument()
  })

  it('initializes in viewer timezone and converts timeslots without slippage when switching zones', async () => {
    const user = userEvent.setup()
    render(
      <TimeZoneProvider initialTimeZone="America/Los_Angeles">
        <EditEventModal onClose={mockOnClose} event={mockEvent} />
      </TimeZoneProvider>
    )

    const tzSelect = screen.getByLabelText(/time zone/i)
    expect(tzSelect).toHaveValue('America/Los_Angeles')

    const startInput = document.querySelector('input[name="startTimes"]') as HTMLInputElement
    // 2027-06-01T10:00:00Z == 2027-06-01T03:00 PDT
    expect(startInput.value).toBe('2027-06-01T03:00')

    // Switch to UTC -> 2027-06-01T10:00
    await user.selectOptions(tzSelect, 'UTC')
    expect(tzSelect).toHaveValue('UTC')
    expect(startInput.value).toBe('2027-06-01T10:00')
  })

  describe('unsaved changes confirmation (#56)', () => {
    it('closes immediately when no fields were changed or only display timezone was switched', async () => {
      const user = userEvent.setup()
      render(
        <TimeZoneProvider initialTimeZone="America/Los_Angeles">
          <EditEventModal onClose={mockOnClose} event={mockEvent} />
        </TimeZoneProvider>
      )

      // Switching timezone converts display time without modifying the underlying UTC instant
      await user.selectOptions(screen.getByLabelText(/time zone/i), 'UTC')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })

    it('prompts before closing when an existing event field is edited and allows keeping or discarding edits', async () => {
      const user = userEvent.setup()
      const { container } = render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

      const nameInput = screen.getByLabelText(/event name/i)
      await user.type(nameInput, ' Special')

      // Clicking backdrop shows discard confirmation
      const backdrop = container.querySelector('[class*="backdrop"]') as HTMLElement
      await user.click(backdrop)
      const dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      expect(dialog).toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()

      // Keep Editing preserves changes
      await user.click(within(dialog).getByRole('button', { name: /keep editing/i }))
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
      expect(nameInput).toHaveValue('Sebring 12hr Special')

      // Pressing Escape prompts again, then confirming Discard closes the modal
      await user.keyboard('{Escape}')
      const secondDialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      await user.click(within(secondDialog).getByRole('button', { name: /discard/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('prompts when an existing timeslot value is modified or a timeslot is added in edit mode', async () => {
      const user = userEvent.setup()
      render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

      const startInput = document.querySelector('input[name="startTimes"]') as HTMLInputElement
      await user.clear(startInput)
      await user.type(startInput, '2027-06-02T14:00')
      await user.click(screen.getByRole('button', { name: /close modal/i }))

      expect(screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })).toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()
    })

    it('closes without confirmation if an edit in edit mode is reverted back to original value', async () => {
      const user = userEvent.setup()
      render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

      const nameInput = screen.getByLabelText(/event name/i)
      await user.type(nameInput, 'X')
      await user.keyboard('{Backspace}')

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })

    it('dismisses Delete Event dialog on Escape without opening discard confirmation', async () => {
      const user = userEvent.setup()
      render(<EditEventModal onClose={mockOnClose} event={mockEvent} />)

      await user.type(screen.getByLabelText(/event name/i), ' Edited')
      await user.click(screen.getByRole('button', { name: /delete event/i }))
      expect(screen.getByRole('dialog', { name: 'Delete Event?' })).toBeInTheDocument()

      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Delete Event?' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })
})
