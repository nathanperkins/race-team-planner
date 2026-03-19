import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionContextValue, useSession } from 'next-auth/react'
import ExpectationsAgreement from './ExpectationsAgreement'
import { agreeToExpectations } from '@/app/actions'

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

vi.mock('@/app/actions', () => ({
  agreeToExpectations: vi.fn(),
}))

describe('ExpectationsAgreement', () => {
  const mockUpdate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSession).mockReturnValue({
      data: null,
      update: mockUpdate,
      status: 'unauthenticated',
    } as unknown as SessionContextValue)
  })

  it('renders the agree button', () => {
    render(<ExpectationsAgreement />)
    expect(screen.getByRole('button', { name: /i agree/i })).toBeInTheDocument()
  })

  it('renders the expectations content', () => {
    render(<ExpectationsAgreement />)
    expect(screen.getByText(/action required/i)).toBeInTheDocument()
    expect(screen.getByText(/have read and understand/i)).toBeInTheDocument()
  })

  const slowAgree = () =>
    new Promise<{ success: true; data: { expectationsVersion: number } }>((resolve) =>
      setTimeout(() => resolve({ success: true, data: { expectationsVersion: 1 } }), 200)
    )

  it('shows loading overlay while saving agreement', async () => {
    vi.mocked(agreeToExpectations).mockImplementation(slowAgree)

    const user = userEvent.setup()
    render(<ExpectationsAgreement />)

    await user.click(screen.getByRole('button', { name: /i agree/i }))

    expect(screen.getByRole('heading', { name: 'Saving agreement...' })).toBeInTheDocument()
  })

  it('disables the button while pending', async () => {
    vi.mocked(agreeToExpectations).mockImplementation(slowAgree)

    const user = userEvent.setup()
    render(<ExpectationsAgreement />)

    await user.click(screen.getByRole('button', { name: /i agree/i }))

    // Button text changes to "Agreeing..." while pending
    expect(screen.getByRole('button', { name: /agreeing/i })).toBeDisabled()
  })

  it('calls agreeToExpectations when button is clicked', async () => {
    vi.mocked(agreeToExpectations).mockImplementation(slowAgree)

    const user = userEvent.setup()
    render(<ExpectationsAgreement />)

    await user.click(screen.getByRole('button', { name: /i agree/i }))

    expect(agreeToExpectations).toHaveBeenCalledTimes(1)
  })
})
