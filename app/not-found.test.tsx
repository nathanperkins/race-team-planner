import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from './not-found'
import { AUTH_ERROR_EMAIL_REQUIRED, GuildMembershipStatus } from '@/lib/auth-errors'

let mockErrorParam: string | null = null

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === 'error' ? mockErrorParam : null),
  }),
}))

describe('NotFound error page', () => {
  afterEach(() => {
    mockErrorParam = null
  })

  it('shows Confirmed Email Required message for phone-only / unverified email Discord accounts', () => {
    mockErrorParam = AUTH_ERROR_EMAIL_REQUIRED
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: 'Confirmed Email Required' })).toBeInTheDocument()
    expect(
      screen.getByText(/only supports Discord accounts with a confirmed email address/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to Login/i })).toHaveAttribute('href', '/')
  })

  it('shows Membership Required message for NOT_MEMBER error', () => {
    mockErrorParam = GuildMembershipStatus.NOT_MEMBER
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: 'Membership Required' })).toBeInTheDocument()
  })

  it('shows Authentication Error for CONFIG_ERROR', () => {
    mockErrorParam = GuildMembershipStatus.CONFIG_ERROR
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: 'Authentication Error' })).toBeInTheDocument()
    expect(screen.getByText(/missing required Discord configuration/i)).toBeInTheDocument()
  })

  it('shows Authentication Error for API_ERROR', () => {
    mockErrorParam = GuildMembershipStatus.API_ERROR
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: 'Authentication Error' })).toBeInTheDocument()
    expect(screen.getByText(/error occurred while verifying/i)).toBeInTheDocument()
  })

  it('shows 404 fallback when no error query param is present', () => {
    mockErrorParam = null
    render(<NotFound />)

    expect(screen.getByRole('heading', { name: '404 - Off Track?' })).toBeInTheDocument()
  })

  it('shows 404 fallback and does not reflect unrecognized or non-error query values', () => {
    mockErrorParam = 'unknown_error_value'
    const { rerender } = render(<NotFound />)
    expect(screen.getByRole('heading', { name: '404 - Off Track?' })).toBeInTheDocument()
    expect(screen.queryByText(/unknown_error_value/i)).not.toBeInTheDocument()

    mockErrorParam = GuildMembershipStatus.MEMBER
    rerender(<NotFound />)
    expect(screen.getByRole('heading', { name: '404 - Off Track?' })).toBeInTheDocument()
  })
})
