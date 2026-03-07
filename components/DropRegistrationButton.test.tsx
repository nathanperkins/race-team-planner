import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import DropRegistrationButton from './DropRegistrationButton'

vi.mock('@/app/actions', () => ({
  deleteRegistration: vi.fn(),
}))

describe('DropRegistrationButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('alert', vi.fn())
  })

  it('shows loading overlay while dropping registration', async () => {
    const { deleteRegistration } = await import('@/app/actions')
    vi.mocked(deleteRegistration).mockReturnValue(new Promise(() => {}))

    const user = userEvent.setup()
    render(<DropRegistrationButton registrationId="reg-1" />)

    await user.click(screen.getByRole('button', { name: /Drop registration/i }))
    await user.click(screen.getByRole('button', { name: /Confirm drop/i }))

    await waitFor(() => {
      expect(screen.getByText('Dropping registration...')).toBeInTheDocument()
    })
  })

  it('does not show loading overlay before confirming', async () => {
    const { deleteRegistration } = await import('@/app/actions')
    vi.mocked(deleteRegistration).mockReturnValue(new Promise(() => {}))

    const user = userEvent.setup()
    render(<DropRegistrationButton registrationId="reg-1" />)

    await user.click(screen.getByRole('button', { name: /Drop registration/i }))

    expect(screen.queryByText('Dropping registration...')).not.toBeInTheDocument()
  })

  it('shows alert and reverts to idle when deleteRegistration throws', async () => {
    const { deleteRegistration } = await import('@/app/actions')
    vi.mocked(deleteRegistration).mockRejectedValue(new Error('Network error'))

    const user = userEvent.setup()
    render(<DropRegistrationButton registrationId="reg-1" />)

    await user.click(screen.getByRole('button', { name: /Drop registration/i }))
    await user.click(screen.getByRole('button', { name: /Confirm drop/i }))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('Failed to drop registration. Please try again.')
    })

    // Button returns to idle state
    expect(screen.getByRole('button', { name: /Drop registration/i })).toBeInTheDocument()
  })
})
