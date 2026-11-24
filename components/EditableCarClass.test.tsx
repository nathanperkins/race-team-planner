import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import EditableCarClass from './EditableCarClass'

vi.mock('@/app/actions', () => ({
  updateRegistrationCarClass: vi.fn(),
}))

const mockCarClasses = [
  { id: 'class-1', name: 'GT3', shortName: 'GT3' },
  { id: 'class-2', name: 'GTE', shortName: 'GTE' },
]

describe('EditableCarClass', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows loading overlay while updating car class', async () => {
    const { updateRegistrationCarClass } = await import('@/app/actions')
    vi.mocked(updateRegistrationCarClass).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ message: 'Success', timestamp: 1 }), 200)
        )
    )

    const user = userEvent.setup()
    render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={mockCarClasses}
      />
    )

    await user.click(screen.getByRole('button', { name: /Class: GT3/i }))
    await user.click(screen.getByRole('button', { name: /GTE/i }))

    await waitFor(() => {
      expect(screen.getByText('Updating car class...')).toBeInTheDocument()
    })

    // Wait for action to complete to prevent timer leaking into subsequent tests
    await waitFor(
      () => expect(screen.queryByText('Updating car class...')).not.toBeInTheDocument(),
      { timeout: 500 }
    )
  })

  it('renders read-only display when readOnly is true', () => {
    render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={mockCarClasses}
        readOnly
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows warning dialog when action returns an error message', async () => {
    const { updateRegistrationCarClass } = await import('@/app/actions')
    vi.mocked(updateRegistrationCarClass).mockImplementation(() =>
      Promise.resolve({ message: 'Failed to update car class', timestamp: Date.now() })
    )

    const user = userEvent.setup()
    render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={mockCarClasses}
      />
    )

    await user.click(screen.getByRole('button', { name: /Class: GT3/i }))
    await user.click(screen.getByRole('button', { name: /GTE/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Update Failed' })).toBeInTheDocument()
      expect(screen.getByText(/Failed to update car class/i)).toBeInTheDocument()
    })
  })

  it('renders read-only display when no registrationId provided', () => {
    render(
      <EditableCarClass
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={mockCarClasses}
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders read-only display when there is only one car class matching current selection', () => {
    render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={[{ id: 'class-1', name: 'GT3', shortName: 'GT3' }]}
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Class: GT3')).toBeInTheDocument()
  })

  it('renders nothing for full Change button variant when there is only one car class', () => {
    const { container } = render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={[{ id: 'class-1', name: 'GT3', shortName: 'GT3' }]}
        variant="full"
        showLabel={false}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('allows selecting the single car class when currentCarClassId is empty (placeholder)', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    render(
      <EditableCarClass
        registrationId="team-1-header"
        currentCarClassId=""
        currentCarClassShortName=""
        placeholderLabel="-"
        carClasses={[{ id: 'class-1', name: 'GT3', shortName: 'GT3' }]}
        deferSubmit
        onChange={onChange}
      />
    )

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('button', { name: 'GT3' }))

    expect(onChange).toHaveBeenCalledWith('class-1')
  })

  it('disables and greys out the currently selected car class in the dropdown', async () => {
    const { updateRegistrationCarClass } = await import('@/app/actions')
    const user = userEvent.setup()

    render(
      <EditableCarClass
        registrationId="reg-1"
        currentCarClassId="class-1"
        currentCarClassShortName="GT3"
        carClasses={mockCarClasses}
      />
    )

    await user.click(screen.getByRole('button', { name: /Class: GT3/i }))

    const currentOption = screen.getByRole('button', { name: 'GT3' })
    const otherOption = screen.getByRole('button', { name: 'GTE' })

    expect(currentOption).toBeDisabled()
    expect(currentOption).toHaveAttribute('aria-current', 'true')
    expect(otherOption).not.toBeDisabled()

    await user.click(currentOption)
    expect(updateRegistrationCarClass).not.toHaveBeenCalled()
  })
})
