import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QuickRegistration from './QuickRegistration'

// Mock app/actions
vi.mock('@/app/actions', () => ({
  registerForRace: vi.fn(),
}))

describe('QuickRegistration', () => {
  const mockCarClasses = [
    { id: 'class-1', name: 'GT3', shortName: 'GT3' },
    { id: 'class-2', name: 'GTE', shortName: 'GTE' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not show warning for eligible user', async () => {
    const user = userEvent.setup()

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventId="event-c-license"
        eventLicenseGroup={3} // Class C event
        userLicenseLevel={5} // User has Class A license (eligible)
      />
    )

    // Click register button to open dropdown
    const registerButton = screen.getByRole('button', { name: /Register/i })
    await user.click(registerButton)

    // Select a car class
    const classButton = screen.getByRole('button', { name: 'GT3' })
    await user.click(classButton)

    // Warning should NOT appear
    expect(screen.queryByText(/ineligible/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows warning popup when ineligible user tries to register', async () => {
    const user = userEvent.setup()

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventId="event-a-license"
        eventLicenseGroup={5} // Class A event
        userLicenseLevel={2} // User has Class D license (ineligible)
      />
    )

    // Click register button to open dropdown
    const registerButton = screen.getByRole('button', { name: /Register/i })
    await user.click(registerButton)

    // Select a car class
    const classButton = screen.getByRole('button', { name: 'GT3' })
    await user.click(classButton)

    // Warning should appear
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
    expect(screen.getByText(/ineligible/i)).toBeInTheDocument()
    expect(screen.getByText(/do not meet the license requirements/i)).toBeInTheDocument()
  })

  it('allows user to cancel registration from warning popup', async () => {
    const user = userEvent.setup()

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventId="event-a-license"
        eventLicenseGroup={5} // Class A event
        userLicenseLevel={2} // User has Class D license (ineligible)
      />
    )

    // Click register and select class
    await user.click(screen.getByRole('button', { name: /Register/i }))
    await user.click(screen.getByRole('button', { name: 'GT3' }))

    // Wait for warning
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    // Warning should disappear
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('allows user to proceed with registration despite warning', async () => {
    const user = userEvent.setup()
    const { registerForRace } = await import('@/app/actions')

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventId="event-a-license"
        eventLicenseGroup={5} // Class A event
        userLicenseLevel={2} // User has Class D license (ineligible)
      />
    )

    // Click register and select class
    await user.click(screen.getByRole('button', { name: /Register/i }))
    await user.click(screen.getByRole('button', { name: 'GT3' }))

    // Wait for warning
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    // Click continue/proceed button
    const continueButton = screen.getByRole('button', { name: /Continue/i })
    await user.click(continueButton)

    // Form should be submitted
    await waitFor(() => {
      expect(registerForRace).toHaveBeenCalled()
    })
  })

  it('does not show warning when event has no license requirement', async () => {
    const user = userEvent.setup()

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventLicenseGroup={null} // No license requirement
        userLicenseLevel={2} // User has Class D license
      />
    )

    // Click register and select class
    await user.click(screen.getByRole('button', { name: /Register/i }))
    await user.click(screen.getByRole('button', { name: 'GT3' }))

    // Warning should NOT appear
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not show warning when user license level is not available', async () => {
    const user = userEvent.setup()

    render(
      <QuickRegistration
        raceId="race-1"
        carClasses={mockCarClasses}
        eventId="event-a-license"
        eventLicenseGroup={5} // Class A event
        userLicenseLevel={null} // User license unknown
      />
    )

    // Click register and select class
    await user.click(screen.getByRole('button', { name: /Register/i }))
    await user.click(screen.getByRole('button', { name: 'GT3' }))

    // Warning should NOT appear (unknown license is not explicitly blocked)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
