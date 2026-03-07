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
    vi.stubGlobal('alert', vi.fn())
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

  it('shows alert when action returns an error message', async () => {
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
      expect(window.alert).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update car class')
      )
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
})
