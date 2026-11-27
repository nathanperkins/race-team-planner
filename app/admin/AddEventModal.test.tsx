import { act, render, screen, within } from '@testing-library/react'
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
  await user.type(screen.getByLabelText(/^Car Classes \*/i), 'GTP, LMP2')

  const inputs = document.querySelectorAll('input[name="startTimes"]')
  if (inputs.length > 0) {
    await user.type(inputs[0] as HTMLElement, '2027-06-01T10:00')
  }
}

describe('AddEventModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the form fields', () => {
    render(<AddEventModal onClose={mockOnClose} />)
    expect(screen.getByLabelText(/event name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^track \*/i)).toBeInTheDocument()
    expect(document.querySelector('input[name="startTimes"]')).toBeInTheDocument()
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
    let resolveCreate!: (value: { message: string }) => void
    vi.mocked(createCustomEvent).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(screen.getByRole('heading', { name: 'Creating event...' })).toBeInTheDocument()

    await act(async () => {
      resolveCreate({ message: '' })
    })
  })

  it('disables submit button while pending', async () => {
    let resolveCreate!: (value: { message: string }) => void
    vi.mocked(createCustomEvent).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        })
    )

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(screen.getByRole('button', { name: /creating/i })).toBeDisabled()

    await act(async () => {
      resolveCreate({ message: '' })
    })
  })

  it('shows error message on submission failure', async () => {
    vi.mocked(createCustomEvent).mockResolvedValue({ message: 'Event name already exists' })

    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    await fillRequiredFields(user)
    await user.click(screen.getByRole('button', { name: /create event/i }))

    expect(await screen.findByText('Event name already exists')).toBeInTheDocument()
  })

  it('defaults Time Zone to GMT / UTC and converts entered timeslots when changing timezone', async () => {
    const user = userEvent.setup()
    render(<AddEventModal onClose={mockOnClose} />)

    const tzSelect = screen.getByLabelText(/time zone/i)
    expect(tzSelect).toHaveValue('UTC')

    const startInput = document.querySelector('input[name="startTimes"]') as HTMLInputElement
    await user.type(startInput, '2027-03-20T12:00')
    expect(startInput.value).toBe('2027-03-20T12:00')

    // Switch to America/Los_Angeles (PDT, UTC-7) -> 05:00
    await user.selectOptions(tzSelect, 'America/Los_Angeles')
    expect(tzSelect).toHaveValue('America/Los_Angeles')
    expect(startInput.value).toBe('2027-03-20T05:00')
  })

  describe('unsaved changes confirmation (#56)', () => {
    it('closes immediately via close button when no changes were made', async () => {
      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      await user.click(screen.getByRole('button', { name: /close modal/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })

    it('closes immediately via Escape when no changes were made', async () => {
      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      await user.keyboard('{Escape}')
      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })

    it('prompts before closing via Cancel, close button, backdrop, or Escape when form has pending changes', async () => {
      const user = userEvent.setup()
      const { container } = render(<AddEventModal onClose={mockOnClose} />)

      await user.type(screen.getByLabelText(/event name/i), 'Daytona 24h')

      // Cancel triggers confirmation and moves focus to Keep Editing
      await user.click(screen.getByRole('button', { name: /cancel/i }))
      let dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: /keep editing/i })).toHaveFocus()
      expect(mockOnClose).not.toHaveBeenCalled()

      // Keep Editing keeps modal open and preserves input
      await user.click(within(dialog).getByRole('button', { name: /keep editing/i }))
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText(/event name/i)).toHaveValue('Daytona 24h')

      // Escape triggers confirmation; pressing Escape again dismisses confirmation without closing modal
      await user.keyboard('{Escape}')
      dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      expect(dialog).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()

      // Backdrop click triggers confirmation, and clicking WarningDialog backdrop dismisses it
      const backdrop = container.querySelector('[class*="backdrop"]') as HTMLElement
      await user.click(backdrop)
      dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      expect(dialog).toBeInTheDocument()
      await user.click(dialog)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()

      // Close button triggers confirmation, and Discard closes modal
      await user.click(screen.getByRole('button', { name: /close modal/i }))
      dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      await user.click(within(dialog).getByRole('button', { name: /discard/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('prompts when a timeslot start time is entered or a timeslot is added', async () => {
      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      const startInput = document.querySelector('input[name="startTimes"]') as HTMLInputElement
      await user.type(startInput, '2027-06-01T10:00')
      await user.click(screen.getByRole('button', { name: /cancel/i }))

      const dialog = screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })
      expect(dialog).toBeInTheDocument()
      expect(mockOnClose).not.toHaveBeenCalled()

      await user.click(within(dialog).getByRole('button', { name: /keep editing/i }))
      await user.clear(startInput)
      await user.click(screen.getByRole('button', { name: /add timeslot/i }))
      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(screen.getByRole('dialog', { name: 'Discard Unsaved Changes?' })).toBeInTheDocument()
    })

    it('closes without confirmation if an edit is reverted back to empty', async () => {
      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      const nameInput = screen.getByLabelText(/event name/i)
      await user.type(nameInput, 'Draft')
      await user.clear(nameInput)

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })

    it('blocks closing via Escape or close button while submission is pending', async () => {
      let resolveCreate!: (value: { message: string }) => void
      vi.mocked(createCustomEvent).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCreate = resolve
          })
      )

      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      await fillRequiredFields(user)
      await user.click(screen.getByRole('button', { name: /create event/i }))

      expect(screen.getByRole('button', { name: /close modal/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

      await user.keyboard('{Escape}')
      expect(mockOnClose).not.toHaveBeenCalled()
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()

      await act(async () => {
        resolveCreate({ message: '' })
      })
    })

    it('closes without discard confirmation after save succeeds', async () => {
      vi.mocked(createCustomEvent).mockResolvedValue({ message: 'Success' })

      const user = userEvent.setup()
      render(<AddEventModal onClose={mockOnClose} />)

      await fillRequiredFields(user)
      await user.click(screen.getByRole('button', { name: /create event/i }))
      expect(await screen.findByText('Event created successfully!')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /cancel/i }))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
      expect(
        screen.queryByRole('dialog', { name: 'Discard Unsaved Changes?' })
      ).not.toBeInTheDocument()
    })
  })
})
